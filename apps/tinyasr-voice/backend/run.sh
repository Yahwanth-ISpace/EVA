#!/bin/bash
export PYTHONPATH=src
uvicorn src.api_transcribe_embed:app --host 0.0.0.0 --port 8000 --reload
