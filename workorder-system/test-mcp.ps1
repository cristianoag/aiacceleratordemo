$ErrorActionPreference = 'Stop'
$url = 'https://app-contosowo-mvjskqas3y4lo.azurewebsites.net/mcp'
$hdr = @{ 'Accept' = 'application/json, text/event-stream' }
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
try {
    $r = Invoke-WebRequest -Uri $url -Method POST -ContentType 'application/json' -Headers $hdr -Body $body
    Write-Output "STATUS: $($r.StatusCode)"
    Write-Output "BODY: $($r.Content)"
} catch {
    $resp = $_.Exception.Response
    if ($resp) {
        Write-Output "STATUS: $($resp.StatusCode.value__)"
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        Write-Output "BODY: $($reader.ReadToEnd())"
    } else {
        Write-Output "ERROR: $($_.Exception.Message)"
    }
}
