/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const firefox = require("selenium-webdriver/firefox");
const { Builder, By, until } = require("selenium-webdriver");
const assert = require("assert");

const firefoxOptions = new firefox.Options();
firefoxOptions.setPreference("xpinstall.signatures.required", false);
// Unset this to run the UI (useful for local testing).
firefoxOptions.headless();

// This is the path to Firefox Nightly on Ubuntu with the Mozilla PPA
if (process.platform === "linux") {
  firefoxOptions.setBinary("/usr/bin/firefox-trunk");
} else if (process.platform === "darwin") {
  firefoxOptions.setBinary("/Applications/Firefox Nightly.app/Contents/MacOS/firefox");
}

describe("Selenium", function () {
  // eslint-disable-next-line mocha/no-hooks-for-single-case
  beforeEach(async function () {
    this.driver = await new Builder()
      .forBrowser("firefox")
      .setFirefoxOptions(firefoxOptions)
      .build();
  });

  // eslint-disable-next-line mocha/no-hooks-for-single-case
  afterEach(async function () {
    await this.driver.quit();
  });

  it("should install the core add-on", async function () {
    await this.driver.get(`file:///${__dirname}/index.html`);
    await this.driver.wait(until.titleIs("Installation Test"), 1000);
    await this.driver.findElement(By.id("install")).click();
    // switch to browser UI context, to interact with Firefox add-on install prompts.
    await this.driver.setContext(firefox.Context.CHROME);
    await this.driver.findElement(By.css(`[label="Add"]`)).click();
    const result = await this.driver.findElement(By.css(`[label="Okay, Got It"]`));

    assert.notStrictEqual(result, null);
  });
});
