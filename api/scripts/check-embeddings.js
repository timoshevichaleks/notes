// Runtime check for EmbeddingsService (the model is ESM/onnx and cannot run
// inside Jest's VM realm). Run with: node scripts/check-embeddings.js
const { EmbeddingsService } = require('../dist/embeddings/embeddings.service');

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

(async () => {
  const service = new EmbeddingsService();
  const deadline = await service.embed('project deadline in Q3');
  const similar = await service.embed('the cutoff date is this autumn');
  const unrelated = await service.embed('a recipe for borscht soup');

  const simScore = cosine(deadline, similar);
  const unrelScore = cosine(deadline, unrelated);

  console.log('dim:', deadline.length);
  console.log('cosine(deadline, similar):  ', simScore.toFixed(4));
  console.log('cosine(deadline, unrelated):', unrelScore.toFixed(4));

  const ok = deadline.length === 384 && simScore > unrelScore;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
