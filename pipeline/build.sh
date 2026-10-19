#!/bin/sh
# Runs build.py in pipeline/.venv. Arguments go to build.py.
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  uv venv -q -p 3.12 .venv
fi
VIRTUAL_ENV="$PWD/.venv" uv pip install -q -r requirements.txt
.venv/bin/python build.py "$@"
