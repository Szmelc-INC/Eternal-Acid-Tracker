#!/usr/bin/env bash
echo "Compiling typescript to javascript"
tsc -p . --extendedDiagnostics
rm -rf dist
mkdir -p dist
echo "Bundling and minifying output"
parcel build --log-level warn --detailed-report 10 target/tracker.js
