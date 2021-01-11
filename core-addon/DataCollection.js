/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The encryption key id and JWK to encrypt data that go
// to the "core" environment (i.e. `pioneer-core`). See
// bug 1677761 for additional details.
const CORE_ENCRYPTION_KEY_ID = "core";
const CORE_ENCRYPTION_JWK = {
  "crv": "P-256",
  "kid": "core",
  "kty": "EC",
  "x": "muvXFcGjbk2uZCCa8ycoH8hVxeDCGPQ9Ed2-QHlTtuc",
  "y": "xrLUev8_yUrSFAlabnHInvU4JKc6Ew3YXaaoDloQxw8",
};

module.exports = class DataCollection {
  /**
   * Sends an empty ping with the provided info.
   *
   * @param {String} rallyId
   *        The id of the Rally platform.
   * @param {String} payloadType
   *        The type of the encrypted payload. This will define the
   *        `schemaName` of the ping.
   * @param {String} namespace
   *        The namespace to route the ping. This will define the
   *        `schemaNamespace` and `studyName` properties of the ping.
   */
  async _sendEmptyPing(rallyId, payloadType, namespace) {
    let publicKey;
    let keyId;

    if (namespace === "pioneer-core") {
      // When routing pings to the "core" environment, we need to use
      // the proper encryption key.
      keyId = CORE_ENCRYPTION_KEY_ID;
      publicKey = CORE_ENCRYPTION_JWK;
    } else {
      // When routing empty pings to the environments for the specific
      // studies, we can use a bogus key (the payload is empty).

      // NOTE - while we're not actually sending useful data in
      // this payload, the current Telemetry pipeline requires
      // that pings are shaped this way so they are routed to the correct
      // study environment.
      //
      // At the moment, the public key used here isn't important but we do
      // need to use *something*.
      keyId = "discarded";
      publicKey = {
        crv: "P-256",
        kty: "EC",
        x: "XLkI3NaY3-AF2nRMspC63BT1u0Y3moXYSfss7VuQ0mk",
        y: "SB0KnIW-pqk85OIEYZenoNkEyOOp5GeWQhS1KeRtEUE",
      };
    }

    await this.sendPing(
      rallyId,
      payloadType,
      // We expect to send an empty payload.
      {},
      namespace,
      keyId,
      publicKey
    );
  }

  /**
   * Sends a Pioneer enrollment ping.
   *
   * The `creationDate` provided by the telemetry APIs will be used as the
   * timestamp for considering the user enrolled in pioneer and/or the study.
   *
   * @param {String} rallyId
   *        The id of the Rally platform.
   * @param {String} [studyAddonid=undefined]
   *        optional study id. It's sent in the ping, if present, to signal
   *        that user enroled in the study.
   */
  async sendEnrollmentPing(rallyId, studyAddonId) {
    // If we were provided with a study id, then this is an enrollment to a study.
    // Send the id alongside with the data and change the schema namespace to simplify
    // the work on the ingestion pipeline.
    if (studyAddonId !== undefined) {
      return await this._sendEmptyPing(rallyId, "pioneer-enrollment", studyAddonId);
    }

    // Note that the schema namespace directly informs how data is segregated after ingestion.
    // If this is an enrollment ping for the pioneer program (in contrast to the enrollment to
    // a specific study), use a meta namespace.
    return await this._sendEmptyPing(rallyId, "pioneer-enrollment", "pioneer-core");
  }

  /**
   * Sends a deletion-request ping.
   *
   * @param {String} rallyId
   *        The id of the Rally platform.
   * @param {String} studyAddonid
   *        It's sent in the ping to signal that user unenrolled from a study.
   */
  async sendDeletionPing(rallyId, studyAddonId) {
    if (studyAddonId === undefined) {
      throw new Error("DataCollection - the deletion-request ping requires a study id");
    }

    return await this._sendEmptyPing(rallyId, "deletion-request", studyAddonId);
  }

  /**
   * Send a ping using the Firefox legacy telemetry.
   *
   * @param {String} rallyId
   *        The id of the Rally platform.
   * @param {String} payloadType
   *        The type of the encrypted payload. This will define the
   *        `schemaName` of the ping.
   * @param {Object} payload
   *        A JSON-serializable payload to be sent with the ping.
   * @param {String} namespace
   *        The namespace to route the ping. This will define the
   *        `schemaNamespace` and `studyName` properties of the ping.
   * @param {String} keyId
   *        The id of the key used to encrypt the payload.
   * @param {Object} key
   *        The JSON Web Key (JWK) used to encrypt the payload.
   *        See the RFC 7517 https://tools.ietf.org/html/rfc7517
   *        for additional information. For example:
   *
   *        {
   *          "kty":"EC",
   *          "crv":"P-256",
   *          "x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
   *          "y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
   *          "kid":"Public key used in JWS spec Appendix A.3 example"
   *        }
   */
  async sendPing(rallyId, payloadType, payload, namespace, keyId, key) {
    if (!rallyId || typeof rallyId != "string") {
      throw new Error(`DataCollection.sendPing - invalid Rally id ${rallyId}`);
    }

    let options = {
      studyName: namespace,
      addPioneerId: true,
      overridePioneerId: rallyId,
      encryptionKeyId: keyId,
      publicKey: key,
      schemaName: payloadType,
      schemaVersion: 1,
      // Note that the schema namespace directly informs how data is
      // segregated after ingestion.
      schemaNamespace: namespace,
    };

    // We intentionally don't wait on the promise returned by
    // `submitExternalPing`, because that's an internal API only meant
    // for telemetry tests. Moreover, in order to send a custom schema
    // name and a custom namespace, we need to ship a custom "experimental"
    // telemetry API for legacy telemetry.
    await browser.firefoxPrivilegedApi
      .submitEncryptedPing("pioneer-study", payload, options)
      .then(() => {
        console.debug(`DataCollection.sendPing - options: ${JSON.stringify(options)} payload: ${JSON.stringify(payload)}`);
      })
      .catch(error => {
        console.error(`DataCollection.sendPing failed - error: ${error}`);
      });
  }

  /**
   * Sends a demographic-survey ping.
   *
   * @param {String} rallyId
   *        The id of the Rally platform.
   * @param {Object} data
   *        A JSON-serializable object containing the demographics
   *        information submitted by the user..
   */
  async sendDemographicSurveyPing(rallyId, data) {
    const FIELD_MAPPING = {
      "age": "age",
      "gender": "gender",
      "hispanicLatinoSpanishOrigin": "origin",
      "school": "education",
      "income": "income",
      "zipCode": "zipCode",
    };

    // Important: the following code flattens out arrays and nested
    // structures (for example, "race": ["a", "b"] becomes in the
    // payload "races": {"a": true, "b": true}). We do this for two
    // reasons:
    //
    // - Analysts won't have to do string checks (e.g. "races".contain("samoan"))
    //   which is error prone, given that any term could be mispelled and
    //   contain typos. With this approach data points will have their own
    //   column (e.g. "races_samoan") and the stored boolean value indicates
    //   whether or not that race was reported.
    // - This future-proofs data by rationalizing it in terms of how
    //   Glean wants it.

    let processed = {};

    // Map all the fields but "race" (because that has multiple
    // possible values).
    for (const [originalField, newName] of Object.entries(FIELD_MAPPING)) {
      if (originalField in data) {
        processed[newName] = { [data[originalField]]: true };
      }
    }

    // Note: "race" gets renamed to "races" and has multiple
    // values.
    if ("race" in data) {
      processed["races"] = data.race.reduce((a, b) => ((a[b] = true), a), {});
    }

    return await this.sendPing(
      rallyId,
      "demographic-survey",
      processed,
      "pioneer-core",
      CORE_ENCRYPTION_KEY_ID,
      CORE_ENCRYPTION_JWK,
    );
  }
};
