// ---------------------------------------------------------------------------
// Blocked shell commands
// Checked via case-insensitive substring match in isBlocked().
// ---------------------------------------------------------------------------

export const BLOCKED_COMMANDS = new Set([
  // --- Destructive filesystem ---
  "rm -rf /",
  "rm -rf ~",
  "rm -rf /*",
  "dd if=/dev/zero",
  "dd if=/dev/random",
  "mkfs",
  "fdisk",
  "parted",
  ":(){ :|:& };:", // Fork bomb
  "chmod 777 /",
  "chmod -R 777",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "init 0",
  "init 6",

  // --- macOS ---
  "brew install",
  "brew reinstall",
  "brew upgrade",
  "brew cask install",
  "brew tap",
  "mas install", // Mac App Store CLI

  // --- Linux (Debian / Ubuntu) ---
  "apt install",
  "apt-get install",
  "apt-get upgrade",
  "apt-get dist-upgrade",
  "apt upgrade",
  "apt dist-upgrade",
  "dpkg -i",
  "dpkg --install",

  // --- Linux (Red Hat / Fedora / CentOS) ---
  "yum install",
  "yum update",
  "dnf install",
  "dnf upgrade",
  "rpm -i",
  "rpm --install",

  // --- Linux (Arch) ---
  "pacman -s",
  "pacman --sync",
  "paru -s",
  "yay -s",

  // --- Linux (openSUSE) ---
  "zypper install",
  "zypper in",

  // --- Linux (Alpine) ---
  "apk add",

  // --- Linux (Snap / Flatpak) ---
  "snap install",
  "flatpak install",

  // --- Windows ---
  "winget install",
  "winget upgrade",
  "choco install", // Chocolatey
  "choco upgrade",
  "scoop install", // Scoop
  "scoop update",
  "msiexec /i", // MSI installer
  "msiexec.exe /i",

  // --- Network ---
  "curl",
  "wget",

  // --- Node.js version managers & global installs ---
  "npm install -g", // npm global install
  "npm i -g",
  "npm install --global",
  "npm update -g",
  "npm update --global",
  "yarn global add", // Yarn v1 global
  "yarn global upgrade",
  "pnpm add -g", // pnpm global
  "pnpm add --global",
  "pnpm update -g",
  "pnpm update --global",
  "bun add -g", // Bun global
  "bun add --global",

  // --- Node.js runtime installers ---
  "nvm install", // nvm
  "nvm use --default",
  "fnm install", // fnm
  "fnm use --default",
  "n install", // n
  "volta install", // Volta
  "nodenv install", // nodenv
]);

export function isBlocked(command: string): boolean {
  const lower = command.toLowerCase().trim();
  for (const blocked of BLOCKED_COMMANDS) {
    if (lower.includes(blocked)) return true;
  }
  return false;
}
