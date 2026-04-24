# Ruoli

| Chi | Cosa fa |
|-----|---------|
| **Maintainer libreria** | Tiene aggiornato `.agent/SKILL.md` / `INTERNAL.md`; review PR auto-generate. |
| **Consumer** | Installa `simpl-libraries` (catalogo); l’agente propone i `*-context` da aggiungere; `/plugin marketplace update` a settimana. |
| **Platform / admin** | `simpl-knowledge`, secrets, branch protection, CI verde. |
| **Bot** | Apre PR di sync e digest instinct (mai merge automatico su contenuto sensibile). |

**Regola**: la knowledge pubblica per integrare una lib sta nel **repo della lib**; le convenzioni trasversali in **`simpl-standards`**; l’indice delle lib interne in **`simpl-libraries`** (`catalog.md`).
