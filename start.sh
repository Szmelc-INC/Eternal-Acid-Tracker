#!/bin/bash

sleep 1
echo "Building..."

# Fresh build Typescript
bash build.sh

sleep 1
echo "Starting detached php on localhost:2137"

sleep 1
nohup php -S localhost:2137 &

sleep 2 && clear
echo "Started. Open browser on http://localhost:2137"
echo "To stop it later, pkill php"
