module.exports = {
    notes: async (parent, args, { models }) => {
        return await models.Note.find();
    },
    note: async (parent, args, { models }) => {
        return await models.Note.findById(args.id);
        // note: (parent, args) => { return note.find(note => note.id === args.id)}
    },
    user: async (parent, { username }, { models }) => {
        return await models.User.findOne({ username });
    },
    users: async (parent, args, { models }) => {
        return await models.User.find({});
    },
    me: async (parent, args, { models, user }) => {
        return await models.User.findById(user.id);
    },
    noteFeed: async (parent, { cursor }, { models }) => {
        //硬上限 若未傳遞游標則預設查詢是空的
        const limit = 5;
        let hasNextPage = false;
        let cursorQuery = {};

        //如果有游標 將搜尋id小於游標的筆記
        if(cursor) {
            cursorQuery = { _id: { $lt: cursor }};
        }

        // 在db中尋找限制 +1 個筆記、反序排列
        let notes = await models.Note.find(cursorQuery)
        .sort({ _id: -1 })
        .limit(limit + 1);

        //如果尋找的筆記數量超過限制 將hasNextPage設為true並將筆記縮減至上限
        if (notes.length > limit) { 
            hasNextPage = true;
            notes = notes.slice(0, -1);
        }
        //新游標將是筆記陣列中最後一項的 mongo物件id
        const newCursor = notes[notes.length -1]._id;

        return {
            notes,
            cursor: newCursor,
            hasNextPage
        };
    }
}