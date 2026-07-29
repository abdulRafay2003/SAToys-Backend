/**
 * Every model serialises the same way: `_id` becomes a string `id`, `__v` and
 * anything marked `private` disappear. The storefront's Zod contract expects
 * `id: string` — without this each controller would be hand-mapping documents.
 */
function serialise(schema) {
  const transform = (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;

    // Honour `private: true` on a path, used for password hashes and OTP secrets.
    schema.eachPath((path, type) => {
      if (type.options && type.options.private) {
        // Nested paths ("a.b") need walking rather than a delete on the root.
        const parts = path.split('.');
        let node = ret;
        for (let i = 0; i < parts.length - 1 && node; i += 1) node = node[parts[i]];
        if (node) delete node[parts[parts.length - 1]];
      }
    });

    return ret;
  };

  schema.set('toJSON', { virtuals: true, versionKey: false, transform });
  schema.set('toObject', { virtuals: true, versionKey: false, transform });
}

module.exports = serialise;
