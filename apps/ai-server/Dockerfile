# Base image with Python 3.10
FROM python:3.10-slim

# Install ffmpeg (required by whisper)
RUN apt-get update && apt-get install -y ffmpeg && apt-get clean

# Set working directory inside the container
WORKDIR /app

# Copy the ai-server code
COPY . .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose FastAPI port
EXPOSE 5001

# Run the FastAPI app with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001"]
