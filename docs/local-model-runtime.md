# Local model runtime

ContentOS does not start model servers. Start approved local servers separately and bind them only to `127.0.0.1`.

The API reads these optional environment variables:

```env
AI_LOCAL_EMBEDDING_BASE_URL=http://127.0.0.1:8082
AI_LOCAL_EMBEDDING_MODEL=Qwen3-Embedding-0.6B
AI_LOCAL_EMBEDDING_API_KEY=
AI_LOCAL_EMBEDDING_TIMEOUT_MS=30000

AI_LOCAL_RERANK_BASE_URL=http://127.0.0.1:8083
AI_LOCAL_RERANK_MODEL=bge-reranker-v2-m3
AI_LOCAL_RERANK_API_KEY=
AI_LOCAL_RERANK_TIMEOUT_MS=30000
```

`semantic_embedding` and `semantic_reranking` are local-only routes in V1. They never fall back to cloud providers automatically. Content Angle continues to use `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_BASE_URL` through the cloud route.

Local model endpoints and credentials are server-side configuration only. Do not put model paths, GGUF filenames, or local endpoint URLs in dashboard code or commit secrets.
