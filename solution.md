# Local-first OpenJev and Kev solution

## Design and changes

The existing review pipeline and dashboard remain in place. Both review modes
use a shared adapter targeting the selected provider's `POST /v1/systemone` API on
`http://127.0.0.1:8009`. The TypeSafe SDK remains solely as a typed protocol
client and question builder; the adapter explicitly supplies a local URL,
placeholder key and model name, so it does not use a hosted Jev model or the
SDK's hosted endpoint defaults. `REVIEW_PROVIDER` selects `openjev` (default)
or [Kev](https://github.com/jaredpalmer/kev). `REVIEW_MODEL` overrides the
provider's API model name (`openjev-local` or `kev-latest`).
`OPENJEV_BASE_URL` and `KEV_BASE_URL` configure their respective local origins;
only the selected provider's URL is used. They can change the port or use
IPv6 loopback. Non-loopback URLs, URL credentials, paths, and redirects are
rejected to avoid inadvertently sending reviewed code to a remote service.
Errors are propagated; there is no hosted fallback.

The Dockerfile installs the open-source `wev-ai` server and CPU PyTorch, runs
as an unprivileged user, and defaults to `alanhuangya/OpenJev-1.7B`. The
dashboard and reviewer continue to run on the host. Both Docker targets declare
their Hugging Face cache as a volume, keeping downloaded weights out of the
container's writable layer. Use the named volumes below so container recreation
reuses the downloads instead of allocating a fresh anonymous volume.
Tests exercise both judgment modes against a local simulated
System One server for both providers, including environment-based selection,
model overrides, rejected URLs, redirects and server errors.

The optional `kev` Docker build target installs Kev from the pinned Kev 1.0
source revision using Python 3.12 and CPU PyTorch. It defaults to
`jaredpalmer/kev-4b@v1.0`; `KEV_MODEL` changes the loaded checkpoint. The final,
default `openjev` target retains the existing server and weights, with
`OPENJEV_MODEL` allowing checkpoint selection at container creation.
Docker Compose selects the build target from the same `REVIEW_PROVIDER`
setting as the review client. There is only one `model` service: it builds
and runs either OpenJev or Kev, never both. Changing the setting and rerunning
`docker compose up --build -d` replaces the service with the selected provider
while preserving both providers' cached weights.
See [README.md](README.md#provider-and-model-selection) for the commands
and complete environment-variable table.

## Environment-driven provider setup

Copy `.env.example` to `.env`. Set `REVIEW_PROVIDER=openjev` for OpenJev
or `REVIEW_PROVIDER=kev` for Kev. Leave `REVIEW_MODEL` unset to select the
matching API name automatically (`openjev-local` or `kev-latest`).
`OPENJEV_MODEL` and `KEV_MODEL` configure server weights; only the selected
provider's checkpoint is loaded.

```bash
docker compose up --build -d
```

Wait for `curl -f http://127.0.0.1:8009/v1/models`, then run either review
command as before. If you previously used `docker run`, stop that old
container first so port 8009 is free. Compose publishes only on host loopback
and starts exactly one provider.

Compose and the review commands both load `.env` automatically; exported shell
variables take precedence. Rerun `docker compose up --build -d` after changing
`REVIEW_PROVIDER`, `KEV_MODEL` or `OPENJEV_MODEL`. This applies the configuration
and preserves named cache volumes. Editing `.env` alone does not change an
already running server. Use `docker compose logs -f model` for startup progress.

## Model cache storage

Compose mounts `jev-review-models:/home/openjev/.cache/huggingface` for OpenJev
or `jev-review-kev-models:/home/kev/.cache/huggingface` for Kev. Model downloads
happen at runtime, not during the image build. These volumes survive container
removal; do not remove them unless you intend to download the weights again.
`docker compose down` preserves the caches; do not use `down -v` if you want to
retain them. If running the images manually without an explicit mount, Docker
creates an anonymous cache volume, which is not automatically reused by a
replacement container.

Named volumes still consume space in Docker's data disk (the Docker VM on
macOS). To keep weights outside that disk entirely, substitute an absolute
host-directory bind mount in a Compose override (set the service volume's
`type: bind`, `source: /absolute/path/kev-models` and
`target: /home/kev/.cache/huggingface` for Kev); ensure the directory
is writable by the container's UID 10001. Check volume usage with
`docker system df -v`. A volume avoids growing the container layer, but does not
reduce the space required for the weights.

## Getting started

Install Node.js 24+, Git and Docker with Compose. From the project directory:

```bash
npm ci
cp .env.example .env
# Set REVIEW_PROVIDER=openjev or REVIEW_PROVIDER=kev in .env.
docker compose up --build -d
```

In another terminal, wait for the model to load:

```bash
curl -f http://127.0.0.1:8009/v1/models
npm run review:changes:save -- /path/to/repository
# Or: npm run review:codebase:save -- /path/to/repository
npm run dashboard
```

Visit `http://127.0.0.1:4317`. Without `.env`, both the client and Compose
default to OpenJev. If you override the published host port in Compose,
update the selected provider's `OPENJEV_BASE_URL` or `KEV_BASE_URL` to match.
The port binding is deliberately restricted to host
loopback: the server itself has no authentication. Do not publish it publicly.
Stop and restart the service with `docker compose stop` and
`docker compose up -d`.

## Models, privacy and limitations

- The first start downloads weights from Hugging Face; only the model download, not repository contents, needs Internet access. The 1.7B weights are about 3.5 GB on disk and CPU inference may need substantially more RAM, especially for long requests. Docker's VM must have sufficient memory. CPU reviews can be slow. The model cache persists in `jev-review-models`.

- To switch OpenJev weights, set `OPENJEV_MODEL=alanhuangya/OpenJev-4B` in `.env` and rerun `docker compose up --build -d`. The 4B weights are approximately 8.4 GB and require considerably more memory. For Kev, set `KEV_MODEL=jaredpalmer/kev-0.8b@v1.0` (or another Kev checkpoint) with `REVIEW_PROVIDER=kev`. Changing the API's `REVIEW_MODEL` does not load new weights. Both Docker targets are CPU-only; CUDA and Apple GPU acceleration are not provided.

- Kev downloads both adapter and base-model weights on first start. Its default 4B model needs substantially more disk and RAM than the smallest models and can be slow on CPU. For native Apple Silicon acceleration or CUDA serving, follow [Kev's local setup](https://github.com/jaredpalmer/kev#run-it-locally), keep the endpoint on loopback, and select `REVIEW_PROVIDER=kev`. Do not use `pip install kev`: that PyPI name belongs to an unrelated project.

- Once the weights are cached, set `HF_HUB_OFFLINE=1` in `.env` and rerun `docker compose up -d` to prevent Hugging Face network access. The image and dependencies must already be built or available locally.

- Only the configured loopback server receives source excerpts, diffs and test context. Any other software running locally that can access that server may also send requests to it. Reports remain in the local `reviews/` directory.

- Local model outputs and calibration can differ from hosted Jev; existing review thresholds are unchanged, not calibrated for either provider. Findings are prompts for human review, not proof. Neither provider is specifically validated here as a code-review model.

- Both providers have token limits; a large source file, diff, test context or question can result in a 422 error. OpenJev's browser-oriented automatic shortening does not generally shorten this application's source state. Kev rejects oversized inputs by default; do not enable truncation for reviews. Narrow the scope or review smaller changes instead of assuming large inputs were fully reviewed.

- Upstream describes the model weights as research artifacts and notes that some training data and teacher outputs have separate terms. Check the [upstream OpenJev documentation](https://github.com/alanhuangyoo/OpenJev) before commercial use.

- Kev is a separate Apache-2.0 project; consult its [model cards](https://github.com/jaredpalmer/kev#models) for each checkpoint's base-model license, context validation and limitations.

## Verification

Run `npm run check` for type checking, dependency direction, dashboard syntax and local protocol tests. To verify actual model inference, start the container and run one of the review commands above; simulated protocol tests do not establish model quality or exercise the model weights.

The OpenJev image was previously built and started locally with the 1.7B model. Its model listing and a typed inference request succeeded, as did screening and profiling a small example in each review mode. These smoke tests do not establish review quality or cover large repositories. The verification container was stopped; the downloaded model cache was retained.

For the Kev addition, `npm run check` passed all six protocol and configuration tests. Both Docker targets built successfully, their server imports and CLI arguments were checked without network access, and their declared cache volumes were writable as the unprivileged users. Actual Kev model downloads and inference were not exercised; these checks do not establish model quality.

The Compose configuration was also validated for an unset provider, OpenJev,
and Kev: each resolves to exactly one service with the matching build target,
image and cache mount. Empty and unknown providers were rejected. Both
environment-selected Compose builds and startup dry runs succeeded; the dry
runs did not start servers or download model weights.
