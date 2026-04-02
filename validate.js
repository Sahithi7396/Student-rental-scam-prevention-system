/**
 * middleware/validate.js
 * Simple field-level validation middleware factory.
 * Usage: validate({ name: 'string', rent: 'number', ... })
 */

const VALID_TYPES = ["pg", "flat", "room"];
const VALID_SCAM_TYPES = ["advance", "fake", "overprice", "noagree", "harassment", "other"];

/**
 * Returns a middleware that checks required fields on req.body.
 * @param {Object} schema  e.g. { name: 'string', rent: 'number' }
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, type] of Object.entries(schema)) {
      const val = req.body[field];

      if (val === undefined || val === null || val === "") {
        errors.push(`'${field}' is required.`);
        continue;
      }

      if (type === "number") {
        const n = Number(val);
        if (isNaN(n) || n < 0) errors.push(`'${field}' must be a non-negative number.`);
      }

      if (type === "string") {
        if (typeof val !== "string" || val.trim().length === 0)
          errors.push(`'${field}' must be a non-empty string.`);
      }

      if (type === "rating") {
        const n = Number(val);
        if (!Number.isInteger(n) || n < 1 || n > 5)
          errors.push(`'${field}' must be an integer between 1 and 5.`);
      }

      if (type === "listing_type") {
        if (!VALID_TYPES.includes(val))
          errors.push(`'${field}' must be one of: ${VALID_TYPES.join(", ")}.`);
      }

      if (type === "scam_type") {
        if (!VALID_SCAM_TYPES.includes(val))
          errors.push(`'${field}' must be one of: ${VALID_SCAM_TYPES.join(", ")}.`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    next();
  };
}

/**
 * Sanitise a string – trim whitespace, limit length.
 */
function sanitize(str, maxLen = 500) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, maxLen);
}

module.exports = { validate, sanitize };
