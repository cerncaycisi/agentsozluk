/^\// {
  exit 1
}

{
  part_count = split($0, parts, "/")
  for (part_index = 1; part_index <= part_count; part_index += 1) {
    if (parts[part_index] == "..") {
      exit 1
    }
  }
}
