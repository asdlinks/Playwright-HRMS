/**
 * Console logging with a timestamp and a level tag.
 *
 * Page objects log the mechanics (a retried click, a fallback taken); tests
 * log the narrative through step() / verified() / warn() / note() in
 * tests/base/BaseTest.ts, which also lands in the HTML report.
 */
export class Log {
  private constructor() {}

  private static stamp(): string {
    return new Date().toISOString().substring(11, 23);
  }

  static info(message: string): void {
    console.log(`${Log.stamp()} INFO  ${message}`);
  }

  static step(message: string): void {
    console.log(`${Log.stamp()} STEP  ${message}`);
  }

  static pass(message: string): void {
    console.log(`${Log.stamp()} PASS  ${message}`);
  }

  static warn(message: string): void {
    console.warn(`${Log.stamp()} WARN  ${message}`);
  }

  static error(message: string): void {
    console.error(`${Log.stamp()} ERROR ${message}`);
  }
}
