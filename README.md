# FUORI DAL FEED

Un'edizione al giorno. Un percorso di lettura, non un feed.

## Stato

Edizione del **23 ottobre 2026** revisionata con 24 contenuti (23 articoli basati su fonti consultate e una riflessione editoriale) in 8 sezioni. I contenuti riportano categoria temporale, data delle fonti e indicazione del controllo. L'archivio conserva le edizioni precedenti. **Il sito non aggiorna le notizie in tempo reale.**

## Esperienza di lettura

- Un unico flusso verticale e finito: introduzioni delle categorie a schermo pieno, articoli e conclusione.
- Soglie editoriali leggere tra i contenuti: separatori discreti e uno spazio di transizione; breve resistenza alla rotellina/trackpad vicino al confine e assestamento nativo di prossimità sui dispositivi touch compatibili.
- Timeline laterale sincronizzata con lo scroll effettivo: posizione corrente, avanzamento nell'articolo, contenuti già percorsi e collegamenti diretti alle sezioni.
- Nessun blocco obbligatorio per tastiera, tecnologie assistive o modalità con movimento ridotto.
- Tipografia editoriale adattiva: articoli ampi su desktop, colonna unica su smartphone.
- Spiegazioni cliccabili dei termini: annotazioni nel margine su desktop, inline sui dispositivi piccoli.
- Sezioni facoltative: **Per capire davvero**, **Per collegare i fatti / La storia fin qui**, **Fonti e documenti**.
- Ripresa dello stesso punto del flusso verticale e delle sezioni aperte tramite `localStorage`, senza account.
- Link precisi agli articoli e pulsante di ritorno alla lettura d'origine per le notizie correlate.
- Archivio delle edizioni selezionabile dall'header.

## Gestione delle edizioni

Il sito legge `data/editions.json`. Ogni edizione ha data, stato editoriale e sezioni con articoli. Ogni articolo può avere `id`, `type`, `title`, `dek`, `paragraphs`, `terms`, `deepDive`, `sources` e `related`.

Tutti i link in `related` devono puntare a una coppia `date` + `storyId` esistente. Non inventare citazioni, studi o correlazioni. Nei conflitti attribuire esplicitamente affermazioni e cifre alla fonte che le fornisce. Nella prima edizione non sono stati simulati falsi articoli storici.

## Pubblicazione

GitHub Pages pubblica il ramo `main` dalla cartella root. Il sito è statico, senza framework o database. I file JavaScript e CSS hanno una versione nella pagina `index.html` per evitare cache obsolete.

**Il sito resta statico.** Le edizioni giornaliere vengono preparate e pubblicate nel repository; il frontend non genera né verifica notizie autonomamente. Ogni aggiornamento editoriale deve controllare fonti, date, link, opportunità e duplicazioni culturali prima del commit.

## Protocollo di qualità e aggiornamento

- Ogni fonte deve rimandare a un articolo o documento preciso, non soltanto alla homepage di una testata.
- La data della notizia e la data di pubblicazione della fonte sono distinte dalla data complessiva dell'edizione.
- Un aggiornamento successivo verificato deve essere incorporato nella cronologia dell'articolo, preservando la differenza fra notizia iniziale e correzione (esempio: sede della protesta dei taxi aggiornata alle 12:18 del 23 ottobre).
- Il controllo **fonti consultate** attesta che il collegamento originale e gli elementi principali sono stati confrontati; non certifica un fact-checking esaustivo di ogni affermazione o un monitoraggio in tempo reale.
- `scripts/validate-editions.mjs` controlla formato JSON, categorie temporali, date, ID, collegamenti interni e presenza di fonti specifiche. `.github/workflows/editorial-integrity.yml` tenta di eseguire il controllo a ogni modifica dell'edizione (se GitHub Actions è abilitato).
- Questi controlli software **non sostituiscono il controllo umano delle notizie**. Non cercano aggiornamenti, non verificano in automatico che una testata non abbia rettificato un articolo e non generano una nuova edizione. Per ciò servirà una pipeline separata con ricerca, confronto e approvazione editoriale.
- Il frontend legge un file statico: le notizie si aggiornano **solo** quando viene preparato e pubblicato un nuovo contenuto nel repository.
