# Define a timestamp function
timestamp() {
  date +"%T"
}

git add . && git commit -m '$(timestamp) WIP' && git push && git push heroku master
