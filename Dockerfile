FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/home/openjev/.cache/huggingface

RUN pip install --no-cache-dir torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir "wev-ai[serve]==0.2.2" \
    && useradd --create-home --uid 10001 openjev \
    && mkdir -p "$HF_HOME" \
    && chown -R openjev:openjev /home/openjev/.cache

USER openjev
EXPOSE 8009

CMD ["wev", "serve", "--model", "alanhuangya/OpenJev-1.7B", "--host", "0.0.0.0", "--port", "8009"]
