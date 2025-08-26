FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
COPY run.sh ./run.sh
EXPOSE 8000
CMD ["./run.sh"]
