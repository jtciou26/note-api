module.exports = {
  notes: async (user, { cursor }, { models }) => {
    const limit = 20;
    let hasNextPage = false;
    let cursorQuery = {};

    if (cursor) {
      cursorQuery = { updatedAt: { $lt: cursor } };
    }

    let notes = await models.Note.find({
      author: user._id,
      ...cursorQuery,
      isRemoved: false
    })
      .sort({ updatedAt: -1 })
      .limit(limit + 1);

    if (notes.length > limit) {
      hasNextPage = true;
      notes = notes.slice(0, -1);
    }
    const newCursor = notes[notes.length - 1]?.updatedAt;

    return {
      notes,
      cursor: newCursor,
      hasNextPage
    };
  },
  favorites: async (user, args, { models }) => {
    return await models.Note.find({ favoritedBy: user._id }).sort({ _id: -1 });
  }
};
