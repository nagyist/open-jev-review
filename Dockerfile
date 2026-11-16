FROM python:3.12-slim AS kev

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/home/kev/.cache/huggingface \
    KEV_MODEL=jaredpalmer/kev-4b@v1.0

RUN pip install --no-cache-dir torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir "kev[serve] @ https://github.com/jaredpalmer/kev/archive/6b719c3c3f367295f6ef336f4f751cf5ff970abc.tar.gz" \
    && useradd --create-home --uid 10001 kev \
    && mkdir -p "$HF_HOME" \
    && chown -R kev:kev /home/kev/.cache

USER kev
VOLUME ["/home/kev/.cache/huggingface"]
EXPOSE 8009

CMD ["sh", "-c", "exec python -m kev.serve --run \"$KEV_MODEL\" --host 0.0.0.0 --port 8009"]

FROM python:3.11-slim AS openjev

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/home/openjev/.cache/huggingface \
    OPENJEV_MODEL=alanhuangya/OpenJev-1.7B

RUN pip install --no-cache-dir torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir "wev-ai[serve]==0.2.2" \
    && useradd --create-home --uid 10001 openjev \
    && mkdir -p "$HF_HOME" \
    && chown -R openjev:openjev /home/openjev/.cache

USER openjev
VOLUME ["/home/openjev/.cache/huggingface"]
EXPOSE 8009

CMD ["sh", "-c", "exec wev serve --model \"$OPENJEV_MODEL\" --host 0.0.0.0 --port 8009"]
