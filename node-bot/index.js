// Bot-music (Node) — pengganti JMusicBot
// discord.js v14 + @discordjs/voice + yt-dlp + ffmpeg
// Command: !play <link/judul>, !skip, !stop, !queue, !np, !pause, !resume, !volume <0-100>
// Prefix: "!" atau mention bot. Token dibaca dari .env (DISCORD_TOKEN).

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
} = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
} = require('@discordjs/voice');

// --- load .env sederhana (tanpa dependensi dotenv) ---
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const TOKEN = process.env.DISCORD_TOKEN || '';
const OWNER_ID = process.env.OWNER_ID || '';
const YTDLP = path.join(__dirname, 'bin', 'yt-dlp');
const PREFIX = '!';
const LEAVE_AFTER_EMPTY_MS = 60 * 1000;

if (!TOKEN) {
  console.error('DISCORD_TOKEN belum diisi di .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// state per guild: { queue: [], player, connection, current, volume, leaveTimer, ytdlpProc }
const guilds = new Map();
function stateFor(guildId) {
  if (!guilds.has(guildId)) {
    guilds.set(guildId, {
      queue: [],
      player: null,
      connection: null,
      current: null,
      volume: 80,
      leaveTimer: null,
      ytdlpProc: null,
    });
  }
  return guilds.get(guildId);
}

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

function ytdlpPath() {
  const candidates = [
    path.join(__dirname, 'bin', 'yt-dlp'),
    path.join(__dirname, 'bin', 'yt-dlp.exe'),
    'yt-dlp',
  ];
  for (const c of candidates) {
    if (c === 'yt-dlp' || fs.existsSync(c)) return c;
  }
  return 'yt-dlp';
}

// Resolve input (URL atau kata kunci) jadi { title, url } lewat yt-dlp
function resolveTrack(input) {
  return new Promise((resolve, reject) => {
    const q = /^https?:\/\//i.test(input) ? input : `ytsearch1:${input}`;
    const args = [
      '--no-check-certificate', '--no-playlist', '--no-warnings',
      '-f', 'bestaudio', '--get-title', '--get-url', q,
    ];
    execFile(ytdlpPath(), args, { timeout: 60000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || '').toString().split('\n').slice(-3).join(' ').trim()));
      const lines = stdout.trim().split('\n').filter(Boolean);
      if (lines.length < 2) return reject(new Error('yt-dlp tidak mengembalikan judul/URL'));
      resolve({ title: lines[0], url: lines[lines.length - 1] });
    });
  });
}

async function ensureVoice(message) {
  const st = stateFor(message.guild.id);
  const channel = message.member?.voice?.channel;
  if (!channel) {
    message.reply('Masuk VC dulu baru pakai command ini.').catch(() => {});
    return null;
  }
  const me = message.guild.members.me;
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionsBitField.Flags.Connect) || !perms?.has(PermissionsBitField.Flags.Speak)) {
    message.reply('Bot butuh izin Connect + Speak di VC ini.').catch(() => {});
    return null;
  }
  if (st.connection && st.connection.joinConfig.channelId === channel.id) return st.connection;
  if (st.connection) { try { st.connection.destroy(); } catch {} st.connection = null; }
  const conn = joinVoiceChannel({
    channelId: channel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  });
  st.connection = conn;
  conn.on(VoiceConnectionStatus.Disconnected, () => {
    log(`[${message.guild.id}] voice disconnected`);
  });
  conn.on('error', (e) => log(`[${message.guild.id}] voice error:`, e.message));
  try {
    await entersState(conn, VoiceConnectionStatus.Ready, 20000);
  } catch {
    message.reply('Bot nggak bisa masuk VC dari server ini: suara Discord pakai UDP dan UDP diblokir total di server ini (sudah dites, socket UDP ditolak OS). Solusinya jalankan bot ini dari laptop/PC lain, bukan dari VM ini.').catch(() => {});
    log(`[${message.guild.id}] voice join gagal: UDP diblokir di VM ini`);
    try { conn.destroy(); } catch {}
    st.connection = null;
    return null;
  }
  return conn;
}

function getPlayer(st, guildId) {
  if (st.player) return st.player;
  const player = createAudioPlayer();
  st.player = player;
  player.on(AudioPlayerStatus.Idle, () => {
    st.current = null;
    playNext(guildId);
  });
  player.on('error', (e) => {
    log(`[${guildId}] player error:`, e.message);
    st.current = null;
    playNext(guildId);
  });
  return player;
}

function scheduleLeave(st, guildId) {
  clearTimeout(st.leaveTimer);
  st.leaveTimer = setTimeout(() => {
    if (st.queue.length === 0 && !st.current) leaveVoice(guildId, false);
  }, LEAVE_AFTER_EMPTY_MS);
}

function leaveVoice(guildId, say = true) {
  const st = guilds.get(guildId);
  if (!st) return;
  clearTimeout(st.leaveTimer);
  st.queue = [];
  st.current = null;
  try { st.ytdlpProc?.kill('SIGKILL'); } catch {}
  st.ytdlpProc = null;
  try { st.player?.stop(true); } catch {}
  try { st.connection?.destroy(); } catch {}
  st.player = null;
  st.connection = null;
  if (say) log(`[${guildId}] left VC`);
}

async function playNext(guildId) {
  const st = guilds.get(guildId);
  if (!st || !st.connection) return;
  const next = st.queue.shift();
  if (!next) {
    scheduleLeave(st, guildId);
    return;
  }
  clearTimeout(st.leaveTimer);
  st.current = next;
  const player = getPlayer(st, guildId);
  st.connection.subscribe(player);
  const proc = spawn(ytdlpPath(), [
    '--no-check-certificate', '--no-playlist', '--no-warnings',
    '-f', 'bestaudio', '-o', '-', next.url,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  st.ytdlpProc = proc;
  let errBuf = '';
  proc.stderr.on('data', (d) => { errBuf += d.toString(); });
  proc.on('error', (e) => {
    log(`[${guildId}] yt-dlp spawn error:`, e.message);
    st.current = null;
    playNext(guildId);
  });
  proc.on('close', (code) => {
    if (code !== 0 && st.current === next) {
      log(`[${guildId}] yt-dlp exit ${code}:`, errBuf.split('\n').slice(-2).join(' ').trim());
    }
  });
  const resource = createAudioResource(proc.stdout, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });
  resource.volume?.setVolume(st.volume / 100);
  try {
    player.play(resource);
    log(`[${guildId}] now playing: ${next.title}`);
  } catch (e) {
    log(`[${guildId}] play failed:`, e.message);
    st.current = null;
    playNext(guildId);
  }
}

client.once('ready', () => {
  log(`Bot online sebagai ${client.user.tag} (${client.user.id})`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const mention = new RegExp(`^<@!?${client.user.id}>\\s*`);
  let body = null;
  if (mention.test(message.content)) body = message.content.replace(mention, '').trim();
  else if (message.content.startsWith(PREFIX)) body = message.content.slice(PREFIX.length).trim();
  else return;
  if (!body) return;

  const [cmdRaw, ...rest] = body.split(/\s+/);
  const cmd = (cmdRaw || '').toLowerCase();
  const arg = rest.join(' ').trim();
  const st = stateFor(message.guild.id);

  try {
    if (cmd === 'play' || cmd === 'p') {
      if (!arg) return message.reply('Pakai: `!play <link YouTube / judul lagu>`');
      const conn = await ensureVoice(message);
      if (!conn) return;
      const m = await message.reply(`Nyari: ${arg} ...`);
      let track;
      try {
        track = await resolveTrack(arg);
      } catch (e) {
        return m.edit(`Gagal load lagu itu: ${e.message || 'error yt-dlp'}`).catch(() => {});
      }
      track.requestedBy = message.author.tag;
      st.queue.push(track);
      clearTimeout(st.leaveTimer);
      await m.edit(`Ditambah ke antrean: **${track.title}** (posisi ${st.queue.length})`).catch(() => {});
      if (!st.current) playNext(message.guild.id);
    } else if (cmd === 'skip' || cmd === 's') {
      if (!st.current && st.queue.length === 0) return message.reply('Lagi nggak muter apa-apa.');
      st.player?.stop(true);
      message.reply('Skip.').catch(() => {});
    } else if (cmd === 'stop' || cmd === 'leave' || cmd === 'dc') {
      leaveVoice(message.guild.id);
      message.reply('Berhenti dan keluar VC.').catch(() => {});
    } else if (cmd === 'queue' || cmd === 'q') {
      const lines = [];
      if (st.current) lines.push(`▶️ **${st.current.title}** (lagi muter)`);
      st.queue.slice(0, 10).forEach((t, i) => lines.push(`${i + 1}. ${t.title}`));
      if (st.queue.length > 10) lines.push(`...dan ${st.queue.length - 10} lagi`);
      message.reply(lines.length ? lines.join('\n') : 'Antrean kosong.').catch(() => {});
    } else if (cmd === 'np' || cmd === 'nowplaying') {
      message.reply(st.current ? `Lagi muter: **${st.current.title}** (request ${st.current.requestedBy || '-'})` : 'Lagi nggak muter apa-apa.').catch(() => {});
    } else if (cmd === 'pause') {
      st.player?.pause(true);
      message.reply('Dijeda.').catch(() => {});
    } else if (cmd === 'resume') {
      st.player?.pause(false);
      message.reply('Lanjut.').catch(() => {});
    } else if (cmd === 'volume' || cmd === 'vol') {
      const v = parseInt(arg, 10);
      if (Number.isNaN(v) || v < 0 || v > 100) return message.reply('Pakai: `!volume 0-100`');
      st.volume = v;
      if (st.player?.state?.resource?.volume) st.player.state.resource.volume.setVolume(v / 100);
      message.reply(`Volume: ${v}%`).catch(() => {});
    } else if (cmd === 'help' || cmd === 'cmds') {
      message.reply('Command: `!play <link/judul>`, `!skip`, `!stop`, `!queue`, `!np`, `!pause`, `!resume`, `!volume 0-100`').catch(() => {});
    }
  } catch (e) {
    log('command error:', e);
    message.reply('Ada error, cek log bot.').catch(() => {});
  }
});

process.on('unhandledRejection', (e) => log('unhandledRejection:', e?.message || e));
process.on('SIGINT', () => { client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });

client.login(TOKEN);
