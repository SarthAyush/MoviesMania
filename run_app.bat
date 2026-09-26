@echo off
title CineBox Streaming Server
echo ==============================================
echo        Starting CineBox Streaming App
echo ==============================================
echo.
echo Checking virtual environment...
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

echo.
echo Launching CineBox on http://localhost:8000 ...
python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload
pause
