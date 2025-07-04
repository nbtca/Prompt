# nbtca-welcome

![Demo](assets/Prompt_demo.gif)

## Install

```bash
npm install
```

## Quick Start (Recommended)

```bash
npx @nbtca/welcome
```

## Run Locally

```bash
node src/index.js
# or
./bin/nbtca-welcome.js
```

## Structure

```
.
├── bin/
│   └── nbtca-welcome.js
├── src/
│   ├── index.js
│   ├── main.js
│   ├── logo/
│   │   ├── printLogo.js
│   │   └── logo.txt
│   ├── gradient/
│   │   └── printGradientText.js
│   ├── animation/
│   │   └── printLolcatAnimated.js
│   └── menu/
│       ├── showMainMenu.js
│       └── handleUserAction.js
├── assets/
│   └── Prompt_demo.gif
```

## FAQ

- logo.txt not found? Ensure `src/logo/logo.txt` exists.
- Animation not working? Run `npm install` to install all dependencies.
- Custom menu/animation? Edit the corresponding module.
