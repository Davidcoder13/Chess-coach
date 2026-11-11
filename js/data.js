import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@4.0.8/+esm';

const db = new Dexie('chess-coach');
db.version(1).stores({ games: 'url,time_class,end_time' });
db.version(2).stores({ games: 'url,time_class,end_time', rewind: 'id' });

export const gameDb = db;

export const saveGame = game => db.games.put(game);
export const saveGames = games => db.games.bulkPut(games);
export const loadAllGames = () => db.games.toArray();
export const getStoredUser = () => localStorage.getItem('user') || '';
export const setStoredUser = user => localStorage.setItem('user', user);
export const refreshGames = () => db.games.toArray();
