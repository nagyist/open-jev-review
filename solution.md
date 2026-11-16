# Local-first OpenJev solution

## Design and changes

The existing review pipeline and dashboard remain in place. Both review modes
use a shared adapter targeting OpenJev's `POST /v1/systemone` API on
`http://127.0.0.1:8009`. The TypeSafe SDK remains solely as a typed protocol
client and question builder; the adapter explicitly supplies a local URL,
placeholder key and model name, so it does not use a hosted Jev model or the
SDK's hosted endpoint defaults. `OPENJEV_BASE_URL` can change the port or use
IPv6 loopback. Non-loopback URLs, URL credentials, paths, and redirects are
rejected to avoid inadvertently sending reviewed code to a remote service.
Errors are propagated; there is no hosted fallback.

The Dockerfile installs the open-source `wev-ai` server and CPU PyTorch, runs
as an unprivileged user, and defaults to `alanhuangya/OpenJev-1.7B`. The
dashboard and reviewer continue to run on the host. A Docker volume caches
model downloads. Tests exercise both judgment modes against a local simulated
System One server, including rejected URLs, redirects and server errors.

## Getting started

Install Node.js 24+, Git and Docker. From the project directory:

```bash
npm ci
docker build -t jev-review-openjev .
docker run --name jev-review-openjev -p 127.0.0.1:8009:8009 \
  -v jev-review-models:/home/openjev/.cache/huggingface jev-review-openjev
```

In another terminal, wait for the model to load:

```bash
curl -f http://127.0.0.1:8009/v1/models
npm run review:changes:save -- /path/to/repository
# Or: npm run review:codebase:save -- /path/to/repository
npm run dashboard
```

Visit `http://127.0.0.1:4317`. The `.env` file is optional; use
`OPENJEV_BASE_URL=http://127.0.0.1:<host-port>` when using a different
published port. The port binding above is deliberately restricted to host
loopback: the server itself has no authentication. Do not publish it publicly.
Stop and restart the container with `docker stop jev-review-openjev` and
`docker start jev-review-openjev`.

## Models, privacy and limitations

- The first start downloads weights from Hugging Face; only the model download, not repository contents, needs Internet access. The 1.7B weights are about 3.5 GB on disk and CPU inference may need substantially more RAM, especially for long requests. Docker's VM must have sufficient memory. CPU reviews can be slow. The model cache persists in `jev-review-models`.

- To switch models, create a new container using the same volume and append, for example, `wev serve --model alanhuangya/OpenJev-4B --host 0.0.0.0 --port 8009` after the image name. The 4B weights are approximately 8.4 GB and require considerably more memory. Dockerfile dependencies are CPU-only; CUDA and Apple GPU acceleration are not provided by this image.

- Once the weights are cached, set `HF_HUB_OFFLINE=1` on `docker run` to prevent Hugging Face network access. The image and dependencies must already be built or available locally.

- Only the configured loopback server receives source excerpts, diffs and test context. Any other software running locally that can access that server may also send requests to it. Reports remain in the local `reviews/` directory.

- OpenJev's outputs and confidence formulas differ from hosted Jev; existing review thresholds are unchanged, not calibrated for this model. Findings are prompts for human review, not proof. OpenJev is not specifically validated here as a code-review model.

- OpenJev has token limits; a large source file, diff, test context or question can result in a 422 error. Its browser-oriented automatic shortening does not generally shorten this application's source state. Narrow the scope or review smaller changes instead of assuming large inputs were fully reviewed.

- Upstream describes the model weights as research artifacts and notes that some training data and teacher outputs have separate terms. Check the [upstream OpenJev documentation](https://github.com/alanhuangyoo/OpenJev) before commercial use.

## Verification

Run `npm run check` for type checking, dependency direction, dashboard syntax and local protocol tests. To verify actual model inference, start the container and run one of the review commands above; simulated protocol tests do not establish model quality or exercise the model weights.

The image was built and started locally with the 1.7B model. Its model listing and a typed inference request succeeded, as did screening and profiling a small example in each review mode. These smoke tests do not establish review quality or cover large repositories. The verification container was stopped; the downloaded model cache was retained.
