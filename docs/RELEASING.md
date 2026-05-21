# Release Process

Git tags are the source of truth for releases.  
Tag format: `mobile/vX.Y.Z` for the mobile app, `api/vX.Y.Z` for the API.

---

## Versioning rules (SemVer)

| Change type                             | Example                                 | Bump                        |
| --------------------------------------- | --------------------------------------- | --------------------------- |
| Backwards-compatible bug fix            | Fix a crash, correct a calculation      | **PATCH** — `0.3.0 → 0.3.1` |
| New feature, still backwards-compatible | New endpoint, new field in response     | **MINOR** — `0.3.0 → 0.4.0` |
| Breaking change                         | Remove an endpoint, change a field name | **MAJOR** — `0.3.0 → 1.0.0` |

---

## Before you tag

1. **Update the version** in `apps/api/pyproject.toml`:

   ```toml
   version = "0.3.1"   # ← new version
   ```

2. **Write the changelog** in `CHANGELOG.md`.  
   Add a new section above the previous one — do **not** edit old entries:

   ```markdown
   ### [0.3.1] - YYYY-MM-DD

   #### Fixed

   - Brief description of what changed and why.
   ```

   Use these section headers as needed: `Added`, `Changed`, `Fixed`, `Removed`, `Security`.

3. **Commit** both files together:
   ```bash
   git add CHANGELOG.md apps/api/pyproject.toml
   git commit -m "chore(api): release v0.3.1"
   ```

---

## Tagging and pushing

Git does **not** push tags automatically — you have to push them explicitly.
The simplest way to do both in one go:

```bash
git push --follow-tags
```

`--follow-tags` pushes the current branch **and** any annotated tags that point to
commits being pushed. It is safe to use every time; it won't push unrelated tags.

If you only need to push a specific tag after the fact:

```bash
git push origin api/v0.3.1
```

### Creating the tag

```bash
git tag -a api/v0.3.1 -m "api: release v0.3.1"
git push --follow-tags
```

> **Annotated vs lightweight tags** — always use `-a` (annotated). Annotated tags
> store the tagger name, date, and message; lightweight tags are just a pointer.
> GitHub shows annotated tags as Releases.

---

## Hotfix (patch release off `main`)

**Now** (everything ships from `main`):

1. Fix the bug directly on `main`
2. Follow the steps above with a PATCH bump (e.g. `0.3.0 → 0.3.1`)

**Later** (once you introduce long-lived feature branches or a `release` branch):

The hotfix workflow changes because `main` may contain unreleased work you don't
want to ship yet.

1. Create a hotfix branch off the last release tag:
   ```bash
   git checkout -b hotfix/api-v0.3.1 api/v0.3.0
   ```
2. Apply the fix and commit
3. Tag and push from the hotfix branch:
   ```bash
   git tag -a api/v0.3.1 -m "api: release v0.3.1"
   git push origin hotfix/api-v0.3.1 --follow-tags
   ```
4. Merge the fix back into `main` so it isn't lost:
   ```bash
   git checkout main && git merge hotfix/api-v0.3.1
   ```

---

## Docker — tying builds to releases

Build the image with the version baked in as a label and tag:

```bash
VERSION=$(grep '^version' apps/api/pyproject.toml | head -1 | cut -d'"' -f2)

docker build \
  --label "org.opencontainers.image.version=$VERSION" \
  --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
  -t monimata-api:$VERSION \
  -t monimata-api:latest \
  apps/api/
```

Push both tags to your registry (e.g. GHCR or Docker Hub):

```bash
docker push monimata-api:$VERSION
docker push monimata-api:latest
```

**Why this matters:**

- **Traceability** — every running container has a version label; `docker inspect`
  tells you exactly which commit it was built from.
- **Rollback** — if `v0.3.2` is broken, redeploy `v0.3.1` by pulling that exact
  image. No rebuilding, no guessing.
- **Immutability** — the `latest` tag always points to the newest release; versioned
  tags (`v0.3.1`) never change. The same image can be promoted from staging to
  production without rebuilding.
- **Audit trail** — your registry becomes a full history of every deployed version,
  matching your git tags one-to-one.

Once you have CI/CD (e.g. GitHub Actions), the build-and-push step runs
automatically when an `api/v*` tag is pushed — you just tag, and the pipeline does
the rest.

---

## Client compatibility — handling stale mobile app versions

The mobile app is distributed via app stores and users don't always update
immediately. When the API ships a breaking change, older clients will still be
sending requests.

### Approach 1 — Minimum client version header (recommended for now)

The mobile app sends its version on every request:

```
X-App-Version: 0.3.0
```

The API checks it against a configured minimum. If the client is too old, return:

```json
HTTP 426 Upgrade Required
{ "detail": "App update required", "min_version": "0.4.0", "update_url": "..." }
```

This is a single FastAPI middleware. The minimum version is controlled via an
environment variable so you can tighten it without redeploying.

### Approach 2 — URL versioning

Prefix breaking routes with a version segment:

```
GET /v1/transactions   ← old behaviour, kept alive
GET /v2/transactions   ← new behaviour
```

Old clients keep working on `/v1` until usage drops to zero, then you remove it.
Heavier to maintain but gives clients a longer migration window.

### Approach 3 — Sunset headers (for gradual deprecation)

Before removing anything, add a warning header to the old endpoint for several
releases:

```
Sunset: Sat, 01 Aug 2026 00:00:00 GMT
Deprecation: true
```

Clients (and developers reading logs) get advance notice before the endpoint
disappears.

**Recommended path for MoniMata:**

1. Add the `X-App-Version` header to the mobile app now (even if the API ignores
   it for now) — it costs nothing and gives you the data.
2. When the first breaking change ships, add the middleware with a permissive
   minimum (just blocking very old versions).
3. Adopt URL versioning only if you need to run two incompatible versions
   simultaneously for an extended period.

---

## Checking existing tags

```bash
git tag --list "api/*" --sort=-version:refname   # all API tags, newest first
git show api/v0.3.0                               # show tag details + commit
```
