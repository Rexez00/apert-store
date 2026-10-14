#!/bin/sh
# Runs server + worker in one container (fits Render's single free service).
node dist/index.js &
node dist/index-worker.js &
wait -n
