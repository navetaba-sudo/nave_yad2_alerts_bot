name: Yad2 Watcher

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm install

      - run: node scraper.js
        env:
          YAD2_URL: ${{ secrets.YAD2_URL }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}

      - name: Commit updated seen list
        run: |
          git config user.name "yad2-watcher-bot"
          git config user.email "actions@github.com"
          git add seen.json
          git diff --staged --quiet || git commit -m "update seen listings"
          git push
