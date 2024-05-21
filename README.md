# Commands
1. Setup
```
npm install
```

2. Copy `.env.example` to create a `.env`, and then enter your scopus username (EID) and password in `.env`

3. Scrape and save as json files
```
node main.js
```

4. Extract information from downloaded json files
```
node extract.js
```