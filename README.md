# UK weather now

Live: https://andyhewitt35-cmyk.github.io/uk-weather-now/

Static page (`site/`). All weather data is fetched live in the browser when you search, so there is no refresh job:
- Open-Meteo forecast API (no key): UK Met Office UKV 2 km (`ukmo_seamless`), fallback `best_match`; best_match also supplies hourly rain probability. Nearby places are batched into one multi-location request (max 30 places); results cached 10 minutes in the browser.
- RainViewer public radar (past ~2 h, zoom ≤7; no nowcast on the free tier).
- postcodes.io for postcode/town lookup; GeoNames places (CC BY 4.0) in `site/towns.json`.
Test: serve `site/` and run `node test.js <url> <prefix>` (playwright-core + Chrome).
