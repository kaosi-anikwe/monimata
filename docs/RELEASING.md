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

## Tagging

```bash
# Create an annotated tag on the release commit
git tag -a api/v0.3.1 -m "api: release v0.3.1"

# Push the commit and the tag
git push && git push origin api/v0.3.1
```

> **Annotated vs lightweight tags** — use `-a` (annotated). Annotated tags store
> the tagger name, date, and message; lightweight tags are just a pointer.
> GitHub shows annotated tags as Releases.

---

## Hotfix (patch release off `main`)

Since everything is currently on `main`:

1. Fix the bug directly on `main`
2. Follow the steps above with a PATCH bump (e.g. `0.3.0 → 0.3.1`)

When you have a separate `release` branch or long-running feature branches, this
process will need updating.

---

## Checking existing tags

```bash
git tag --list "api/*" --sort=-version:refname   # all API tags, newest first
git show api/v0.3.0                               # show tag details + commit
```
