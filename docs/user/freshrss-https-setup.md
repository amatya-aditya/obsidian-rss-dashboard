# Connect FreshRSS over HTTPS

RSS Dashboard requires a secure HTTPS endpoint for FreshRSS. This guide shows one Windows setup using Caddy in front of a FreshRSS Docker container, then explains how to enter the endpoint and credentials in Obsidian.

FreshRSS documents reverse-proxy configurations, including Caddy, and requires its configured `base_url` to match the URL users access. Caddy is one way to provide HTTPS; it is not a special requirement of FreshRSS. See the [FreshRSS Caddy guide](https://freshrss.github.io/FreshRSS/en/admins/Caddy.html) and [FreshRSS mobile/API guide](https://freshrss.github.io/FreshRSS/en/users/06_Mobile_access.html).

## Choose the address first

The HTTPS hostname must resolve to the computer running FreshRSS, and the certificate must be trusted by the computer running Obsidian.

- For Obsidian on the same computer, `localhost` is suitable for a local-only setup.
- For another computer or phone, `localhost` points to that other device. Use a hostname or address reachable from that device, such as a Tailscale DNS name, and configure a certificate valid for that name.
- Caddy's `tls internal` creates certificates from Caddy's local certificate authority. Each client device must trust that authority. Do not disable certificate checks to work around trust errors. For access across devices, use a certificate and hostname those devices can validate, or follow Caddy's documented CA trust steps.

## Windows Caddy setup for a local Docker-published FreshRSS port

This example assumes the FreshRSS container publishes its web port on the Windows host at `127.0.0.1:8080`, and Obsidian runs on that same computer. If your Docker port mapping differs, use the host-side address and port from `docker ps` or Docker Desktop.

1. Download the Windows Caddy executable from the [Caddy download page](https://caddyserver.com/download). If you save it in Downloads, its name may be `caddy_windows_amd64.exe`.
2. Create a folder such as `%USERPROFILE%\caddy-freshrss`.
3. In that folder, create a plain text file named exactly `Caddyfile`, with no `.txt` extension. In File Explorer, turn on **View → Show → File name extensions** so you can confirm the name.
4. Put this configuration in the file:

   ```caddyfile
   {
       auto_https disable_redirects
   }

   https://localhost:8443 {
       bind 127.0.0.1 [::1]
       tls internal
       reverse_proxy 127.0.0.1:8080
   }
   ```

5. Open PowerShell and validate the file, substituting your Windows username if you typed a literal path:

   ```powershell
   & "$env:USERPROFILE\Downloads\caddy_windows_amd64.exe" validate --config "$env:USERPROFILE\caddy-freshrss\Caddyfile" --adapter caddyfile
   ```

6. Start Caddy in that PowerShell window:

   ```powershell
   & "$env:USERPROFILE\Downloads\caddy_windows_amd64.exe" run --config "$env:USERPROFILE\caddy-freshrss\Caddyfile" --adapter caddyfile
   ```

   Keep that window open while using the plugin. To make `caddy` work as a short command, move the executable to a folder on `PATH`; otherwise, continue using its full path as above.

7. Open `https://localhost:8443/` in a browser on the same computer. Resolve any certificate trust warning using Caddy's official [local HTTPS documentation](https://caddyserver.com/docs/automatic-https#local-https); do not proceed by bypassing certificate validation.

## Set FreshRSS's public URL and enable its API

In FreshRSS, enable **Allow API access** in the user's authentication settings and set an API password in the user's profile. FreshRSS recommends a separate API password because it grants less access than the main account password.

Set FreshRSS's `base_url` to the HTTPS address users will use, including the trailing slash. For this local example, it is `https://localhost:8443/`. How you edit `base_url` depends on the Docker deployment; FreshRSS documents it as a system configuration value and provides a Docker `BASE_URL` option. After changing it, restart FreshRSS if your deployment requires it.

Open the API test link from the FreshRSS profile and run **Check full server configuration**. Resolve warnings or failures there before connecting the plugin. FreshRSS's Google Reader API endpoint for this example is:

```text
https://localhost:8443/api/greader.php
```

Enter the endpoint through `/api/greader.php`; do not add `/reader/api/0` to the setting. RSS Dashboard uses the Google Reader-compatible API.

## Add the credential bundle in Obsidian

Create a secret in Obsidian's **SecretStorage** containing valid JSON with the FreshRSS username and the API password from the previous section:

```json
{
  "username": "your-freshrss-login",
  "apiPassword": "your-freshrss-api-password"
}
```

Use the login name you enter on FreshRSS and the API password, not the main FreshRSS password. Save the JSON string as the secret value, then select that SecretStorage entry in **Settings → RSS Dashboard → FreshRSS → FreshRSS credential bundle**. RSS Dashboard stores the selected entry's reference, not the secret value.

Set the HTTPS endpoint, select the credential entry, and choose **Test connection**. Once the status says connected, use **Sync now**.

## Troubleshooting

### PowerShell says `caddy` is not recognized

PowerShell cannot find the executable by its short name. Use the full path to `caddy_windows_amd64.exe` as shown above, or add the folder containing it to your Windows `PATH` and open a new PowerShell window. Downloading the Docker image does not install a `caddy` command in Windows PowerShell.

### The file is named `Caddyfile.txt`

Rename it to exactly `Caddyfile`. Windows may hide known extensions, making a text file appear to have the right name. Turn on **File name extensions** in File Explorer before renaming.

### The browser or plugin cannot trust the HTTPS certificate

The local `tls internal` certificate is issued by Caddy's local CA. Follow Caddy's official local HTTPS instructions to trust that CA on the device running Obsidian. Each device needs its own trust setup. A Tailscale address or DNS name also needs a certificate valid for that exact name. Never switch the endpoint back to HTTP or disable TLS verification.

### FreshRSS reports “Probable invalid base URL”

This warning concerns FreshRSS's configured `base_url`, not the plugin's credential bundle. Set the FreshRSS base URL to the HTTPS address used by the browser and plugin, then rerun FreshRSS's API configuration test. The URL should match the proxy's hostname, port, and any subpath.

### RSS Dashboard says the credential bundle was rejected

Check that the secret contains valid JSON with exactly the `username` and `apiPassword` string properties shown above. Use your FreshRSS login and API-specific password. A plain password, an API key by itself, malformed JSON, or the main account password will not work as this bundle.

### It works on the computer but not on a phone or another computer

`localhost` always means the device making the request. Replace it with a hostname reachable from the other device, configure Caddy to serve that hostname, set FreshRSS `base_url` to the same HTTPS URL, and ensure the other device trusts the certificate. With Tailscale, connect both devices to the tailnet and use the machine's Tailscale DNS name; `localhost` will not route to the server from the phone.

### FreshRSS API tests pass but plugin connection fails

Confirm that the plugin endpoint ends with `/api/greader.php`, starts with `https://`, and uses the same host and port as FreshRSS's working API test URL. Then check the selected SecretStorage entry and its API password. A passing FreshRSS API test validates FreshRSS's API setup, but does not confirm that Obsidian trusts the HTTPS certificate or that the selected secret is correct.
