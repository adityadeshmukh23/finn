FROM python:3.12-slim

RUN useradd -m -u 1000 app
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY --chown=app backend backend
COPY --chown=app data data

USER app
# PUBLIC_DEMO also makes LLM_MODE default to mock; set LLM_MODE=auto as a Space variable to allow live calls.
ENV PUBLIC_DEMO=true \
    FINN_DATA_DIR=/app/data \
    PYTHONUNBUFFERED=1
WORKDIR /app/backend
EXPOSE 7860
CMD ["uvicorn", "finn.main:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers", "--forwarded-allow-ips", "*"]
