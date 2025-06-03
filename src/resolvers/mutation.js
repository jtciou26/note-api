const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const {
  AuthenticationError,
  ForbiddenError
} = require('apollo-server-express');
const mongoose = require('mongoose');
require('dotenv').config();

const gravatar = require('../util/gravatar');

module.exports = {
  newNote: async (parent, args, { models, user, userContext, eventLogger }) => {
    if (!user) {
      throw new AuthenticationError('You must be signed in');
    }

    try {
      const note = await models.Note.create({
        content: args.content,
        author: mongoose.Types.ObjectId(user.id),
        favoriteCount: 0
      });

      // Log the note creation event to pub/sub
      if (eventLogger) {
        try {
          await eventLogger.logNoteCreated(
            {
              id: note._id.toString(),
              content: note.content,
              author: note.author.toString(),
              createdAt: note.createdAt,
              favoriteCount: note.favoriteCount
            },
            {
              ...userContext,
              userId: user.id
            }
          );
        } catch (logError) {
          // Don't fail the mutation if logging fails, just log the error
          console.error('Failed to log note creation event:', logError);
        }
      }

      return note;
    } catch (error) {
      console.error('Error creating note:', error);
      throw error;
    }
  },
  deleteNote: async (parent, { id }, { models, user, userContext, eventLogger }) => {
    if (!user) {
      throw new AuthenticationError('You must be signed in');
    }

    const note = await models.Note.findById(id);

    if (note && String(note.author) != user.id) {
      throw new ForbiddenError("You don't have permission to delete the note");
    }
    try {
      await models.Note.findOneAndUpdate(
        { _id: id },
        { isRemoved: true },
        { new: true }
      );

      // Log the note deletion event to pub/sub
      if (eventLogger && note) {
        try {
          await eventLogger.logNoteDeleted(
            {
              id: note._id.toString(),
              author: note.author.toString(),
              content: note.content
            },
            {
              ...userContext,
              userId: user.id
            }
          );
        } catch (logError) {
          console.error('Failed to log note deletion event:', logError);
        }
      }

      return true;
    } catch (err) {
      console.error(`Error removing the note: ${err.message}`);
      return false;
    }
  },
  updateNote: async (parent, { content, id }, { models, user, userContext, eventLogger }) => {
    if (!user) {
      throw new AuthenticationError('You must be signed in');
    }
    const note = await models.Note.findById(id);
    if (note && String(note.author) != user.id) {
      throw new ForbiddenError("You don't have permission to update the note");
    }

    try {
      const updatedNote = await models.Note.findOneAndUpdate(
        {
          _id: id
        },
        {
          $set: {
            content
          }
        },
        {
          new: true
        }
      );

      // Log the note update event to pub/sub
      if (eventLogger && updatedNote) {
        try {
          await eventLogger.logNoteUpdated(
            {
              id: updatedNote._id.toString(),
              content: updatedNote.content,
              author: updatedNote.author.toString(),
              updatedAt: updatedNote.updatedAt
            },
            {
              ...userContext,
              userId: user.id
            }
          );
        } catch (logError) {
          console.error('Failed to log note update event:', logError);
        }
      }

      return updatedNote;
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  },
  signUp: async (parent, { username, email, password }, { models }) => {
    // normalize email address
    email = email.trim().toLowerCase();
    username = username.trim();
    // hash the password
    const hashed = await bcrypt.hash(password, 10);
    // create the gravatar url
    const avatar = gravatar(email);
    try {
      const user = await models.User.create({
        email,
        username,
        avatar,
        password: hashed
      });

      // create and return the json web token
      return jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    } catch (err) {
      // if there's a problem creating the account, throw an error
      throw new Error('Error creating account');
    }
  },
  signIn: async (parent, { username, email, password }, { models }) => {
    if (email) {
      // normalize email address
      email = email.trim().toLowerCase();
    }

    const user = await models.User.findOne({
      $or: [{ email }, { username }]
    });

    // if no user is found, throw an authentication error
    if (!user) {
      throw new AuthenticationError('Error signing in');
    }

    // if the passwords don't match, throw an authentication error
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new AuthenticationError('Error signing in');
    }

    // create and return the json web token
    return jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  },
  toggleFavorite: async (parent, { id }, { models, user }) => {
    if (!user) {
      throw new AuthenticationError();
    }
    // 檢查使用者是否已將note加入最愛
    let noteCheck = await models.Note.findById(id);
    const hasUser = noteCheck.favoritedBy.indexOf(user.id);

    // 如果使用者存在於清單、將他們從清單中提取、並將count減一
    if (hasUser >= 0) {
      return await models.Note.findByIdAndUpdate(
        id,
        {
          $pull: {
            favoritedBy: mongoose.Types.ObjectId(user.id)
          },
          $inc: {
            favoriteCount: -1
          }
        },
        {
          // Set new to true to return the updated doc
          new: true
        }
      );
    } else {
      return await models.Note.findByIdAndUpdate(
        id,
        {
          $push: {
            favoritedBy: mongoose.Types.ObjectId(user.id)
          },
          $inc: {
            favoriteCount: 1
          }
        },
        {
          new: true
        }
      );
    }
  },
  updateUsername: async (parent, { username, id }, { models }) => {
    try {
      return await models.User.findOneAndUpdate(
        {
          _id: id
        },
        {
          $set: {
            username
          }
        },
        {
          new: true
        }
      );
    } catch (err) {
      throw new Error('Username already exists');
    }
  }
};
