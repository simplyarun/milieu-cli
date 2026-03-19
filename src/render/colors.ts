import chalk from "chalk";

function isColorEnabled(): boolean {
  const noColor = process.env["NO_COLOR"];
  if (noColor !== undefined && noColor !== "") {
    return false;
  }
  return true;
}

const colorEnabled = isColorEnabled();

export function green(text: string): string {
  return colorEnabled ? chalk.green(text) : text;
}
export function yellow(text: string): string {
  return colorEnabled ? chalk.yellow(text) : text;
}
export function red(text: string): string {
  return colorEnabled ? chalk.red(text) : text;
}
export function cyan(text: string): string {
  return colorEnabled ? chalk.cyan(text) : text;
}
export function dim(text: string): string {
  return colorEnabled ? chalk.dim(text) : text;
}
export function bold(text: string): string {
  return colorEnabled ? chalk.bold(text) : text;
}
