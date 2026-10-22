# FUORI DAL FEED

Un'edizione al giorno. Un percorso di lettura, non un feed.

## Stato

Edizione pilota del **22 ottobre 2026** pubblicata in `data/editions.json`: 12 articoli originali in italiano, basati su fonti giornalistiche e istituzionali consultabili. I contenuti non vengono ancora generati o verificati automaticamente.

## Esperienza di lettura

- Una sezione alla volta, introduzioni di capitolo a schermo pieno.
- Lettura verticale degli articoli, navigazione orizzontale tra schermate.
- Timeline laterale discreta: mostra avanzamento reale nello scorrimento e schermate completate.
- Tipografia editoriale adattiva: articoli ampi su desktop, colonna unica su smartphone.
- Spiegazioni cliccabili dei termini: annotazioni nel margine su desktop, inline sui dispositivi piccoli.
- Sezioni facoltative: **Per capire davvero**, **Per collegare i fatti / La storia fin qui**, **Fonti e documenti**.
- Ripresa dello stesso punto e delle sezioni aperte tramite `localStorage`, senza account.
- Link precisi agli articoli e pulsante di ritorno alla lettura d'origine per le notizie correlate.
- Archivio delle edizioni selezionabile dall'header.

## Gestione delle edizioni

Il sito legge `data/editions.json`. Ogni edizione ha data, stato editoriale e sezioni con articoli. Ogni articolo può avere `id`, `type`, `title`, `dek`, `paragraphs`, `terms`, `deepDive`, `sources` e `related`.

Tutti i link in `related` devono puntare a una coppia `date` + `storyId` esistente. Non inventare citazioni, studi o correlazioni. Nei conflitti attribuire esplicitamente affermazioni e cifre alla fonte che le fornisce. Nella prima edizione non sono stati simulati falsi articoli storici.

## Pubblicazione

GitHub Pages pubblica il ramo `main` dalla cartella root. Il sito è statico, senza framework o database. I file JavaScript e CSS hanno una versione nella pagina `index.html` per evitare cache obsolete.

**Non è ancora installato alcun sistema di aggiornamento automatico.** La futura automazione editoriale dovrà verificare fonti, date e link, gestire duplicazioni/correzioni e committare le edizioni prima del deploy.
