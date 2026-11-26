$ErrorActionPreference = 'Stop'

$surveyPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
$surveyWebPage = Join-Path $PSScriptRoot 'web/dist/index.html'
if (-not (Test-Path -LiteralPath $surveyPython -PathType Leaf)) {
    throw 'Set up the Python environment using the README before starting the demo.'
}
if (-not (Test-Path -LiteralPath $surveyWebPage -PathType Leaf)) {
    throw 'Build the web app using the README before starting the demo.'
}

$surveyDataDir = Join-Path $PSScriptRoot 'data'
[System.IO.Directory]::CreateDirectory($surveyDataDir) | Out-Null
$surveyDatabase = (Join-Path $surveyDataDir 'local-demo.sqlite3').Replace('\', '/')
$surveySettings = @{
    SURVEY_DATABASE_URL = "sqlite:///$surveyDatabase"
    SURVEY_LOCAL_DEV = '1'
    SURVEY_SEED_DEMO = '1'
    SURVEY_ADMIN_TOKEN = $null
}
$surveyPreviousSettings = @{}
foreach ($surveyName in $surveySettings.Keys) {
    $surveyPreviousSettings[$surveyName] = [Environment]::GetEnvironmentVariable($surveyName, 'Process')
}

Push-Location -LiteralPath $PSScriptRoot
try {
    foreach ($surveyName in $surveySettings.Keys) {
        [Environment]::SetEnvironmentVariable($surveyName, $surveySettings[$surveyName], 'Process')
    }
    & $surveyPython -m uvicorn server.main:create_app_from_env --factory --host 127.0.0.1 --port 8000
    if ($LASTEXITCODE -ne 0) { throw "The demo server exited with code $LASTEXITCODE." }
} finally {
    foreach ($surveyName in $surveyPreviousSettings.Keys) {
        [Environment]::SetEnvironmentVariable($surveyName, $surveyPreviousSettings[$surveyName], 'Process')
    }
    Pop-Location
}
