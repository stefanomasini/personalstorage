# personalstorage

Documentation and software tools for managing and maintaining the personal file storage of Stefano Masini, currently located in `~/Dropbox`.

## Tooling

See [TOOLING.md](TOOLING.md) for how to access the Dropbox API via Maestral (listing folders, shared links, shared folders) without triggering local sync.

## Directory Structure Analysis

Analysis performed on 2026-03-04.

### Intentional Patterns

These are well-organized structures that reflect deliberate filing decisions.

#### 1. Family members (`Famiglia/`)
Children organized by name (`Martino/`, `Lia/`), each with consistent sub-categories:
- `Scuola/` — school enrollment and reports (further split by school name)
- `Salute/` — medical records, date-prefixed
- `Carta Identità Elettronica/`, `Tessera Sanitaria/`, `Passaporto/` — identity documents
- `Cellulare Fastweb/` — phone contracts
- `Vaccinazioni, COVID, GreenPass/` — vaccination records

Also contains `Società Luna/` (family real estate company) with `Spese/`, `Ricevute/`, `CU - Certificazione unica/`, `Affitto poliambulatorio/`.

#### 2. Properties by address (`Case/`)
Each property identified by street address:
- `Via Tevere 10` — ISP contract, photos
- `Via Mengoni 18` — renovations, appliance manuals (`Garanzie e istruzioni/`), utility bills (`Hera/`)
- `Via Dante di Nanni 31` — the most complete: `Servizi/` (utilities by provider: Sgr, Hera, Enel, TARI, etc.), `Condominio/` (HOA meetings by year), `Impianti/` (boiler, garage), rental contracts, maintenance history
- `Poliambulatorio` — linked to Società Luna: maintenance, tenancy, elevator service
- `Willemstraat 26` — Dutch property: utilities, lawyer

#### 3. Country-based life chapters
- `Italia/` — Italian bureaucracy: banking (`Conti Valmarecchia/` with sub-accounts and cards), insurance (`Assicurazioni/`), telecom (`TIM/` with invoices by year), tax agency (`Agenzia entrate/`), schools, postal bonds (`Buoni postali fruttiferi/`), residency paperwork, medical expenses
- `Netherlands/` — Dutch life: Waldorf schools (`Vrije School/` with per-child folders), childcare subsidies (`Toeslagen/`), health insurance and receipts (`Health/` organized by year with individual receipt folders)

#### 4. Vehicles (`Mezzi/`)
Organized by vehicle name + plate number: `Yaris FM202AL`, `Vespa FO142091`, `Transalp BF45109`. Each with `Bolli/`, `Assicurazione/`, `Revisioni/`. Old vehicles archived under `Vecchi/`. Also contains bikes and helmets.

#### 5. Work & Business
- `Aramis/` — own consulting business: `Expenses/` (with `to_process`/`processed` pipeline), `Carta 6095/` (credit card statements by year), `Logo Aramis/` (branding assets), `OLD Aramis ITA/` (closed Italian entity 2010–2012)
- `Sistemistica Aramis/` — sysadmin documentation per client (Buffetti, Errebian, Kratos, Vanni, etc.) plus Linode and VPN configs
- `People/Balsamiq/` — employment history: contracts by year, pay slips (`Buste paga/`), expense reports, welfare
- `People/Clienti Aramis/` — client folders (Errebian, Buffetti, Kratos, Spicers, Desktoo, etc.)
- `People/MyBrandPortal/` — a project with technical, business, and legal docs

#### 6. Date-prefixed naming convention
Used extensively and consistently throughout: `YYYY-MM-DD - description` for events, medical visits, contracts, bills. This is the dominant naming pattern for items within organized folders.

#### 7. Scans pipeline (`Scansioni/`)
- `Processed/` — filed by category: `Identità`, `Assicurazioni`, `Lavoro`, `Casa`, `Finanza`, `Medico`, `Varie`
- `Altra roba molto vecchia da processare/` — backlog of unsorted old material (photos, negatives, old documents)
- `Media/` — scanned media

#### 8. Personal (`Stefano/`)
Tax returns (`Dichiarazione redditi Stefano/` by year), membership cards (`Tessere/` — Ikea, KLM), blog, drawings, phone docs, accounting docs.

#### 9. Structured accounting (`accounting_docs/`)
Organized by type (`Assets/`, `Liabilities/`) then by entity (`Personal`, `Aramis-NL`, `Aramis-IT`, `Luna`, `MyBrandPortal`).

#### 10. Events & trips by time (`_by time/`)
Chronological archive of events: yearly folders (`1993-2014`, `2015`–`2022`) and individual dated events (`2023-04-15 - US Chicago + Las Vegas`, `2023-09-05 - Napoli`, `2025-05-26 conf berlino`). Also contains WhatsApp chat exports.

#### 11. Talks & presentations (`Talks/`)
Tech presentations, each date-prefixed with conference name: React, Redux, Relay, GraphQL, Docker/Convox, Remote Work. Range: 2014–2020.

#### 12. Music (`Musica/`)
Family music projects: `GarageBand Stefano/` (Ableton and GarageBand projects), `Martino Musica/` (bass lessons, klasseband, GarageBand projects), `B+C/`.

#### 13. Photos (`Photos/`)
Event-based photo collections: trips (India 2010, Stoccolma 2011), places (Leiden apartments), weddings, outings. Range: 2010–2012.

#### 14. Books (`books/`)
Ebooks including a `Calibre Library/` (by author), audiobooks (`audiolibri/` — Italian classics), Steiner books.

#### 15. Appliance warranties (`Garanzie e istruzioni/`)
Root-level collection of warranties and manuals organized by item: computers, electronics, garden tools, music gear, kitchen appliances, phones, furniture (Herman Miller), robot vacuum, projector, UPS, etc.

#### 16. Art project (`Small Man Art/`)
Daily drawing/illustration project running Jun 24, 2012 – Jun 5, 2013 (~340 images). Each file is `YYYY-MM-DD - Title.tif`. A personal creative archive.

---

### Accumulation & Issues

These are problems caused by organic file dumping over the years.

#### 1. Loose files at root level
The root of `~/Dropbox` has ~40+ orphan files that don't belong to any folder:
- **Unnamed scans/screenshots**: `2022-06-07 13.09.41.pdf`, `2023-12-28 15.40.56.pdf`, `2024-02-18 10.32.44.pdf`, etc. — timestamp-only names with no context
- **Phone photos**: `20241109_081312.jpg`, `20260112_173843.jpg`, `IMG-20240215-WA0008.jpg` — dumped from phone/WhatsApp
- **Event tickets**: `Biglietti Cremonini 13 Giu 2026.pdf`, `biglietti avatar 2.pdf`, `biglietti-fiera-oriente.pdf`, `villa borghese.pdf`, `Tessera cinema.pdf`, `DANIELE SILVESTRI.pdf`, `Luca Carboni.pdf`, `Biglietto Scrovegni.pdf`
- **Random music files**: `Arrow.mp3`, `Harp.mp3`, `Morning Light.mp3`
- **Misc**: `Pomodori.ods`, `wip.patch`, `Brewfile.lock.json`, `stepper.pdf`, `Cats in the garden.mp4`, `tumiturbi 1993-12.pdf`, `Medicinali Ayurveda.pdf`, `pa06-4012_NI-A824.pdf`, `sole_*.pdf` (4 files)
- **MuseScore duplicates**: `Esercizio 2 Lia Masini.mscz` and `Esercizio_2 Lia Masini.mscz`

#### 2. Duplicate / overlapping structures
- `Expenses/` (root, contains a single file) vs `Aramis/Expenses/` — unclear boundary
- `accounting_docs/` (root) vs `Stefano/accounting_docs/` — same thing?
- `Contabilità casa/` (root) overlaps with `Italia/` financial data and `accounting_docs/`
- `Garanzie e istruzioni/` (root, general appliances) vs `Case/Via Mengoni 18/Garanzie e istruzioni/` (house-specific) — same concept split across two places
- `N26/` (root) — should be under `Italia/` or a banking section
- `Pragmatic Bookshelf/` (root, 5 programming books) vs `books/` — overlapping
- `Sistemistica Aramis/` (root) vs `Aramis/` and `People/Clienti Aramis/` — three places for Aramis-related client work
- `2025-09-22 - AI conf Paris/` and `2025-11 balsamiq retreat/` at root — should be in `_by time/`

#### 3. Inconsistent naming
- Mixed languages: `Famiglia/` vs `Family Room/`, `Mezzi/` vs `Photos/`, `Ricette/` vs `Expenses/`
- Mixed case: `books/` vs `Photos/`, `accounting_docs/` vs `Contabilità casa/`
- Odd prefix: `_by time/` — underscore convention used nowhere else
- `2025-05-27 Local-first conf` is inside `Mezzi/` (vehicles) — clearly misplaced

#### 4. Orphaned / legacy directories
- `Family Room/` — empty, old Dropbox shared folder
- `Paper Docs/` — empty, deprecated Dropbox Paper feature
- `Stuff makerspace/` — single subfolder from 2018, likely stale
- `stewiki/` — old personal wiki backup (`stewiki.html_backup`)
- `mar rosso/` — contains a single PDF
- `other/` — catch-all containing only `Yoga - Meditazione/`
- `Ricette/` — small (Indian recipes from Mitran), possibly stale

#### 5. Sensitive files exposed at root
- `secrets-aramis.dat`, `secrets-balsamiq.dat`, `secrets-stefano.dat`
- `stefano.ovpn`
- `stefano_gpg_public.key`
- `1Password emergency kits/`

These are security-sensitive and probably shouldn't sit in the Dropbox root unprotected.

#### 6. App-managed directories (not user-organized)
- `Apps/` — Dropbox app integrations (Balsamiq Cloud backups, Aramis Receipts)
- `iTerm2 Preferences/` — single plist file for iTerm2 config sync
- `.moneydancesync/` — financial software sync
- `.mscbackup/` — MuseScore backup
- `.ws.agile.1Password.settings` — 1Password settings file

---

### Sharing Audit

Last updated: 2026-03-04 via Dropbox API.

#### Shared Folders (6 total)

All owned by Stefano, all family/personal:

| Folder | Path | Shared with |
|--------|------|-------------|
| Case | `/case` | Chiara Teodorani |
| Famiglia | `/famiglia` | Chiara Teodorani |
| Salute Martino | `/famiglia/martino/salute martino` | Chiara Teodorani, Martino Masini |
| Martino Musica | `/musica/martino musica` | Martino Masini |
| 2025-08-27 - Foto vecchio cell Lia | `/famiglia/lia/...` | Chiara Teodorani, Lia Masini |
| Ricetta pagnotta pasquale della nonna Elia | `/ricette/...` | (no other members) |

Note: `Ricetta pagnotta...` has no other members — sharing is effectively unused.

#### Shared Links (29 total, all public, no expiration)

| Area | Count | Notes |
|------|-------|-------|
| `/case/` | 10 | Appliance manuals and house systems from `AAA - Via Verga 19` (boiler, appliances, gate, timer), plus Willemstraat energie scan and Campo Via Tevere |
| `/garanzie e istruzioni/` | 6 | Computer hardware (UPS, motherboard, label printer), electronics, powerline, radiators |
| `/_by time/` | 4 | Cave computer project (2 links), mensole albero, SuperPanda booklet |
| `/famiglia/` | 3 | Stefano's liceo writings (2), photo |
| `/musica/` | 3 | Beato Book PDF, band MIDI files, rehearsal |
| `/books/` | 1 | Italian children's book |
| `/mezzi/` | 1 | Car accident photos (Martino Yaris) |
| `/people/` | 1 | Aramis npm package (Feather Bed) |

**Remaining concerns:**
- All 29 remaining links are public with no expiration or password

**Additional discovery**: The shared links revealed a property `Case/AAA - Via Verga 19` with appliances, boiler, gate/garage — this was not visible in the local directory listing (likely cloud-only via smart sync).
