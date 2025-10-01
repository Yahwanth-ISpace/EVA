# Base image
FROM python:3.10-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && apt-get clean

# Set working dir
WORKDIR /app

# Copy code
COPY . .

# Install deps
RUN pip install --no-cache-dir -r requirements.txt

# Expose Railway default port
EXPOSE 8000

# Start app
CMD ["python", "main.py"]
