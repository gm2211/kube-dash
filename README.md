# kube-dash

A local, client-side Kubernetes dashboard powered by your local `kubectl`. It serves a browser UI on localhost and uses your local `kubectl` config to read cluster resources.

## Screenshots

![kube-dash overview with resource charts and live kubectl data](docs/screenshots/overview.png)

## Quick Install

Install `kd` with:

```sh
curl -fsSL https://raw.githubusercontent.com/gm2211/kube-dash/main/install.sh | bash
```

Then run:

```sh
kd
```

The installer clones kube-dash into `~/.kube-dash` and links `kd` into `~/.local/bin`.
If your shell cannot find `kd`, add `~/.local/bin` to your `PATH`.

## Quick Update

Update to the latest `main`:

```sh
kd update
```

## Use It

Run:

```sh
kd
```

The dashboard opens at `http://localhost:8765`, discovers your kube contexts, and loads resources from the selected context automatically.

To use another port:

```sh
kd --port 9000
```
