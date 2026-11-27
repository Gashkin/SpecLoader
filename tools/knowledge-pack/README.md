# Replay a knowledge pack

From a clean checkout on Windows with Node.js 22 on PATH, run:

```powershell
node tools/knowledge-pack/replay.mjs --seed tools/knowledge-pack/example/seed.json --out tools/knowledge-pack/example/briefing.md
node --test tools/knowledge-pack/replay.test.mjs
```

Open the generated Markdown and follow its evidence IDs to the local excerpts and canonical sources. The example is synthetic. Replay uses Node built-ins and needs no installation step or network after checkout.

## Prepare a pack

Copy the example structure into a versioned directory outside the checkout for real material. Keep the directory private to authorised source readers. Use relative paths for excerpts and put the generated file inside the pack. Keep the independent answer key outside the reader's directory.

1. Agree the task, questions, sources, allowed excerpts and readership. Save exact excerpt bytes. Record their SHA-256, canonical URL, section or line locator, and source revision or page edit marker. Complete means the selected excerpt was captured in full. For missing or partial evidence record the limitation.
2. A curator checks each claim against its excerpts and decision authority. Use stable IDs, a state and one or more source IDs. Record any qualification explicitly. Link superseded claims to the replacing decision. Keep related leads reachable through source pointers. The seed records the capture date, version, reviewer and review date.
3. Run the documented command with the private seed and output paths. Record the renderer commit, Node version, versioned inputs and output digest. Store the receipt with the evidence. The program checks references and integrity; the curator owns the interpretation.
4. To refresh, preserve the old directory and copy it into a new version. Recapture allowed sources, review all affected claims including those whose original source is unchanged, update the seed and replay. An unavailable capture can support an unknown. Mark claims affected by partial evidence explicitly. Investigate conflicting authoritative accounts before presenting a settled decision.

Verification uses a fresh reader with the questions and briefing, followed by comparison with the separately reviewed answer key. Record mistakes, missing coverage and actual preparation or maintenance effort in the authorised evidence location. Only synthetic fixtures and redacted receipts belong in the repository.
