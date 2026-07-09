// Wraps an async Express handler so rejected promises reach the error middleware
// instead of becoming unhandled rejections (Express 4 doesn't await handlers itself).
module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
