#!/bin/bash
# Jalankan JMusicBot (butuh Java 11 + config.txt di folder ini)
cd "$(dirname "$0")"
exec java -Dnogui=true -jar JMusicBot-0.4.3.jar
