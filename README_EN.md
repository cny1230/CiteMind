<div align="center">

[简体中文](README.md) | **English**

<br/>
<br/>

<img src="https://img.shields.io/badge/Java-21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white" alt="Java 21"/>
<img src="https://img.shields.io/badge/Spring_Boot-3.5-6DB33F?style=for-the-badge&logo=springboot&logoColor=white" alt="Spring Boot 3.5"/>
<img src="https://img.shields.io/badge/Vue-3.5-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white" alt="Vue 3.5"/>
<img src="https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
<img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="MIT"/>

</div>

<br/>

<h1 align="center">CiteMind</h1>

<p align="center">
  <strong>Enterprise RAG Knowledge Platform · A runnable full-stack skeleton</strong>
</p>

<p align="center">
  CiteMind = Citation + Mind — every answer traceable to its source.
</p>

---

## What is this?

CiteMind is a **RAG (Retrieval-Augmented Generation) knowledge platform**:
document upload → parsing & chunking → vector (pgvector HNSW) + keyword (Elasticsearch IK) dual indexing →
hybrid-retrieval Q&A with citation traceability → AI Agent multi-turn chat (SSE streaming + short-term memory),
with group-level knowledge isolation.

This repository is a **runnable-UI + backend-skeleton** full-stack project:

- ✅ **Frontend is 100% runnable** — all 10 pages render with a built-in mock layer
  (login, upload state transitions, streaming Q&A, agent chat, metrics charts all demoable).
- ✅ **Backend keeps a complete skeleton** — package structure, class names, mapping annotations and
  data contracts (entities/DTOs/VOs/enums/mappers) are intact; business logic is intentionally stripped.
  Every class carries responsibility Javadoc and a "skeleton placeholder" note.
- ✅ **Full documentation set** — requirement spec (with person-day estimates), API reference,
  database design, and FE/BE integration guide, like a normally maintained project.

Great as a **learning sandbox / re-implementation training ground**: read the docs, then implement the
RAG pipeline yourself inside the prepared class skeletons.

## Two run modes

| Mode | How | What you get |
|---|---|---|
| **Demo** (default) | frontend only: `npm run dev` | All pages interactive; login with any account (`admin/admin123` = admin) |
| **Full** | middleware + backend + `VITE_USE_MOCK=false` | Real upload/parse/retrieval/generation pipeline (backend logic to be implemented by you) |

## Quick start (demo mode)

```bash
cd CiteMind-frontend
npm install
npm run dev
# open http://localhost:5173 → Login → admin / admin123
```

## Tech stack

Java 21 · Spring Boot 3.5 · MyBatis-Plus · JJWT · pgvector · Elasticsearch 8 (IK) · MinIO ·
Spring AI Alibaba (DashScope qwen-plus) · Vue 3.5 · TypeScript · Vite 8 · Element Plus · Pinia

## Documentation

| Doc | Content |
|---|---|
| [01-需求规格说明书](docs/01-需求规格说明书.md) | Requirements per module with acceptance criteria & person-day estimates |
| [02-接口文档](docs/02-接口文档.md) | 47 endpoints: request/response examples, SSE protocol, error semantics (Chinese) |
| [03-数据库设计文档](docs/03-数据库设计文档.md) | 18 tables: fields, indexes, ER diagram, conventions (Chinese) |
| [04-前后端联调规范](docs/04-前后端联调规范.md) | Response envelope, token flow, SSE protocol, mock switching (Chinese) |

## License & Credits

Refactored from the open-source project [**Argus**](https://github.com/DevYangJC/Argus) (MIT License):
backend implementation stripped, class skeletons and all UI pages preserved, documentation rewritten & expanded.
Thanks to the original author. This repository is also released under the [MIT License](LICENSE).

---

<p align="center"><sub>CiteMind · every answer traceable to its source</sub></p>
