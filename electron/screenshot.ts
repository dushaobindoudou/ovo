import screenshot from "screenshot-desktop";

export class ScreenshotManager {
  private simulate = process.env.OVO_SIMULATE_CAPTURE === "1";

  setSimulation(enabled: boolean) {
    this.simulate = enabled;
  }

  isSimulationEnabled() {
    return this.simulate;
  }

  async captureScreen(): Promise<Buffer> {
    if (this.simulate) {
      return Buffer.from("ovo-simulated-screenshot");
    }
    try {
      const image = await screenshot({ format: "png" });
      return Buffer.isBuffer(image) ? image : Buffer.from(image);
    } catch {
      this.simulate = true;
      return this.captureScreen();
    }
  }

  toBase64(image: Buffer) {
    return image.toString("base64");
  }
}
