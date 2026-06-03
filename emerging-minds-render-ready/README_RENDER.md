# Render deployment

This folder is ready for a simple Render deploy.

## Files
- `app.py` runs the Python web server and API
- `index.html`, `app.js`, `styles.css` are the front end
- `emerging_minds_resource_catalogue.csv` is the data source
- `render.yaml` lets Render detect the service settings

## Deploy steps
1. Put these files in a GitHub repo.
2. In Render, choose **New +** -> **Blueprint** or **Web Service**.
3. Connect the GitHub repo.
4. Confirm the detected settings:
   - Runtime: Python
   - Start command: `python app.py`
5. Deploy.

## Important changes already made
- Server now binds to `0.0.0.0` instead of `127.0.0.1`
- Server now reads the `PORT` environment variable
- CSV path now points to the repo root
- Static files are served from the repo root

## Notes
- The free plan can spin down after inactivity.
- If you want, this app could later be converted to a fully static site for even easier hosting.
