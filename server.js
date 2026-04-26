const express = require("express");
const app = express();

app.use(express.static(__dirname));

app.get("/api/test", (req,res)=>{
  res.json({status:"ok"});
});

app.listen(process.env.PORT || 3000, ()=>{
 console.log("Server avviato");
});
