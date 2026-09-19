# PowerShell script to deploy C:\amigo/public to Netlify (interactive)
# Usage: Run in an elevated PowerShell if npm global installs require admin.

Set-Location -Path "C:\amigo"

Write-Host "1) Installing Netlify CLI (may ask for admin privileges)..."
npm install -g netlify-cli

Write-Host "2) Logging into Netlify (a browser window will open). Complete auth in browser, then return here."
netlify login

Write-Host "3) Initializing or linking site (follow prompts). If asked choose 'Create & configure a new site' or link existing."
netlify init

Write-Host "4) Deploying production from 'public/' directory..."
netlify deploy --prod --dir=public

Write-Host "Deployment finished. Note the published URL above."
Write-Host "Next: In Netlify dashboard -> Site settings -> Domain management -> Add custom domain -> enter facebook1.com and follow DNS instructions."
