module.exports = {
  // parent 父查詢的結果、args 使用者在查詢中傳遞的參數
  notes: async (parent, args, { models }) => {
    return await models.Note.find().limit(100);
  },
  note: async (parent, args, { models }) => {
    return await models.Note.findById(args.id);
    // note: (parent, args) => { return note.find(note => note.id === args.id)}
  },
  user: async (parent, args, { models }) => {
    return await models.User.findOne({ username: args.username });
  },
  users: async (parent, args, { models }) => {
    return await models.User.find({}).limit(100);
  },
  me: async (parent, args, { models, user }) => {
    return await models.User.findById(user.id);
  },
  noteFeed: async (parent, { cursor }, { models }) => {
    //ref: facil src/db/data/post/model.js
    //硬上限 若未傳遞游標則預設查詢是空的
    const limit = 10;
    let hasNextPage = false;
    //如果沒有游標那預設回傳空的 找出最新的筆記
    let cursorQuery = {};

    //如果有游標 將搜尋id小於游標的筆記 cursorQuery = { _id: { $lt: cursor } };
    // 改用 updatedAt 排序
    if (cursor) {
      cursorQuery = { updatedAt: { $lt: cursor } };
    }

    // 在db中尋找限制 +1 個筆記、反序排列
    let notes = await models.Note.find({ ...cursorQuery, isRemoved: false })
      .sort({ updatedAt: -1 })
      .limit(limit + 1);

    //如果尋找的筆記數量超過限制 將hasNextPage設為true並將筆記縮減至上限

    if (notes.length > limit) {
      hasNextPage = true;
      notes = notes.slice(0, -1);
    }
    //新游標將是筆記陣列中最後一項的 mongo物件id
    const newCursor = notes[notes.length - 1]?.updatedAt;

    return {
      notes,
      cursor: newCursor,
      hasNextPage
    };
  },
  searchNotes: async (_, { keyword }, { models }) => {
    return await models.Note.find(
      { $text: { $search: keyword }, isRemoved: false },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } }, { updatedAt: -1 })
      .limit(100);
  }
};
