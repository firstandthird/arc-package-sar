module.exports = {
  toParam: (s) => {
    const strArr = s.replace('_', ' ').split(' ');
    strArr.forEach((p, i) => {
      strArr[i] = p.charAt(0).toUpperCase() + p.substr(1).toLowerCase();
    });

    return strArr.join('');
  }
};
