# Self-Review

## Project Reflection

I really liked the process of building this project because I had this idea for a long time before finally implementing it. It was also my first experience creating more complex backend services instead of focusing mainly on frontend development.

Another important aspect was working on an AI-focused product rather than only a traditional full-stack application. Building real ingestion pipelines, asynchronous workflows, and AI-assisted processing made the project feel much closer to a real production system.

---

## What Went Well

- Long architectural planning from the beginning saved a lot of time later, even though it was one of the longest stages.
- The ingestion agent pipeline worked well despite being relatively complex and involving many processing steps.
- Separating the system into specialized services and agents made the project easier to extend and reason about later in development.
- Queue-based asynchronous processing helped simplify long-running workflows and improved system stability.

---

## Technical Challenges

- Separating concerns between agents and designing proper communication between them was difficult.
- Dealing with environment setup and infrastructure configuration such as Docker, Redis, PostgreSQL, and Qdrant required significant effort.
- PDF parsing and transaction extraction turned out to be less reliable and standardized than expected.
- Managing AI-related workflows and validating LLM outputs required additional deterministic validation layers.

---

## Trade-Offs Made

- Agents mainly communicate through queues and abstracted shared structures rather than directly in order to simplify orchestration and reduce coupling.
- No authentication flow was implemented in order to focus more on AI, RAG, MCP integration, and course-related objectives.
- A simpler Python PDF parser setup was chosen instead of more advanced systems such as Docling because the additional complexity was not necessary for the current stage of the project.
- The project prioritized backend architecture and workflows over advanced frontend polish.

---

## What Could Be Improved

- Add stronger observability, tracing, and monitoring across services.
- Improve automated testing coverage, especially adversarial scenarios.
- Expand analytics capabilities and long-term historical trend analysis.
- Improve advisor memory and personalization capabilities.
- Add multi-user support and proper authentication/authorization flows.

---

## Lessons Learned

- Agent orchestration is significantly more difficult than building isolated services.
- Token usage grows very quickly in AI-heavy systems and must be considered during architecture planning.
- The infrastructure and pipelines around the model are often more important than the model call itself.
- LLM systems require strong validation and fallback mechanisms to remain reliable.
- Queue-based workflows are extremely useful for AI-driven asynchronous systems.

---

## Scalability & Architecture Reflection

Breaking the project into smaller independent services helped significantly during development. It made the architecture easier to reason about and reduced complexity when adding new functionality.

Using asynchronous queues also improved scalability and separation of concerns between ingestion, analytics, and advisor-related workflows.

The modular structure should make it easier to extend the platform with additional agents, integrations, or financial tools in the future.

---

## AI & Agent System Reflection

Using AI tools during development, planning, debugging, and testing was extremely important for this project.

The planning stage was especially valuable. Long architectural discussions and iterative design conversations helped identify better approaches and avoid major structural mistakes early in development.

The project also demonstrated that building AI systems is much more than simply calling an LLM API. Most of the complexity comes from orchestration, validation, persistence, retrieval systems, and workflow reliability.

---

## Final Reflection

This project was one of the most enjoyable and educational software projects I have worked on so far. It helped me learn much more about backend engineering, asynchronous architectures, AI orchestration, RAG systems, queues, and service communication.

The project also reinforced the importance of architectural planning, modularity, and reliability when building AI-powered systems. While there are still many improvements that could be made, the final result successfully achieved the original project goals and provided valuable real-world engineering experience.